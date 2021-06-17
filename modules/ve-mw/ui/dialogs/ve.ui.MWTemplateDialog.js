/*!
 * VisualEditor user interface MWTemplateDialog class.
 *
 * @copyright 2011-2020 VisualEditor Team and others; see AUTHORS.txt
 * @license The MIT License (MIT); see LICENSE.txt
 */

/**
 * Abstract base class for dialogs that allow to insert and edit MediaWiki transclusions, i.e. a
 * sequence of one or more template invocations that strictly belong to each other (e.g. because
 * they are unbalanced), possibly mixed with raw wikitext snippets. Currently used for:
 * - {@see ve.ui.MWTransclusionDialog} for arbitrary transclusions. Registered via the name
 *   "transclusion".
 * - {@see ve.ui.MWCitationDialog} in the Cite extension for the predefined citation types from
 *   [[MediaWiki:visualeditor-cite-tool-definition.json]]. These are strictly limited to a single
 *   template invocation. Registered via the name "cite".
 *
 * @class
 * @abstract
 * @extends ve.ui.NodeDialog
 *
 * @constructor
 * @param {Object} [config] Configuration options
 */
ve.ui.MWTemplateDialog = function VeUiMWTemplateDialog( config ) {
	// Parent constructor
	ve.ui.MWTemplateDialog.super.call( this, config );

	// Properties
	this.transclusionModel = null;
	this.loaded = false;
	this.altered = false;
	this.preventReselection = false;
	this.templateParameterPlaceholderPages = {};

	this.confirmOverlay = new ve.ui.Overlay( { classes: [ 've-ui-overlay-global' ] } );
	this.confirmDialogs = new ve.ui.WindowManager( { factory: ve.ui.windowFactory, isolate: true } );
	this.confirmOverlay.$element.append( this.confirmDialogs.$element );
	$( document.body ).append( this.confirmOverlay.$element );
};

/* Inheritance */

OO.inheritClass( ve.ui.MWTemplateDialog, ve.ui.NodeDialog );

/* Static Properties */

ve.ui.MWTemplateDialog.static.modelClasses = [ ve.dm.MWTransclusionNode ];

/**
 * Configuration for booklet layout.
 *
 * @static
 * @property {Object}
 * @inheritable
 */
ve.ui.MWTemplateDialog.static.bookletLayoutConfig = {
	continuous: true,
	outlined: false
};

/* Methods */

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getReadyProcess = function ( data ) {
	return ve.ui.MWTemplateDialog.super.prototype.getReadyProcess.call( this, data )
		.next( function () {
			this.bookletLayout.focus( 1 );

			this.bookletLayout.stackLayout.getItems().forEach( function ( page ) {
				if ( page instanceof ve.ui.MWParameterPage ) {
					page.updateSize();
				}
			} );
		}, this );
};

/**
 * Called when the transclusion model changes. E.g. parts changes, parameter values changes.
 */
ve.ui.MWTemplateDialog.prototype.onTransclusionModelChange = function () {
	if ( this.loaded ) {
		this.altered = true;
		this.setApplicableStatus();
	}
};

/**
 * Handle parts being replaced.
 *
 * @param {ve.dm.MWTransclusionPartModel} removed Removed part
 * @param {ve.dm.MWTransclusionPartModel} added Added part
 */
ve.ui.MWTemplateDialog.prototype.onReplacePart = function ( removed, added ) {
	var i, len, page, name, names, params, partPage, reselect, addedCount,
		removePages = [];

	if ( removed ) {
		// Remove parameter pages of removed templates
		partPage = this.bookletLayout.getPage( removed.getId() );
		if ( removed instanceof ve.dm.MWTemplateModel ) {
			params = removed.getParameters();
			for ( name in params ) {
				removePages.push( this.bookletLayout.getPage( params[ name ].getId() ) );
			}
			removed.disconnect( this );
		}
		if ( this.loaded && !this.preventReselection && partPage.isActive() ) {
			reselect = this.bookletLayout.findClosestPage( partPage );
		}
		removePages.push( partPage );
		this.bookletLayout.removePages( removePages );
	}

	if ( added ) {
		page = this.getPageFromPart( added );
		if ( page ) {
			this.bookletLayout.addPages( [ page ], this.transclusionModel.getIndex( added ) );
			if ( reselect ) {
				// Use added page instead of closest page
				this.transclusions.focusPart( added.getId() );
			}
			// Add existing params to templates (the template might be being moved)
			if ( added instanceof ve.dm.MWTemplateModel ) {
				names = added.getOrderedParameterNames();
				// Prevent selection changes
				this.preventReselection = true;
				for ( i = 0, len = names.length; i < len; i++ ) {
					this.onAddParameter( added.getParameter( names[ i ] ) );
				}
				this.preventReselection = false;
				added.connect( this, { add: 'onAddParameter', remove: 'onRemoveParameter' } );
				if ( names.length ) {
					this.transclusions.focusPart( added.getParameter( names[ 0 ] ).getId() );
				}
			}

			// Add required and suggested params to user created templates
			if ( added instanceof ve.dm.MWTemplateModel && this.loaded ) {
				// Prevent selection changes
				this.preventReselection = true;
				addedCount = added.addPromptedParameters();
				this.preventReselection = false;
				names = added.getOrderedParameterNames();
				if ( names.length ) {
					this.transclusions.focusPart( added.getParameter( names[ 0 ] ).getId() );
				} else if ( addedCount === 0 ) {
					page.onAddButtonFocus();
				}
			}
		}
	} else if ( reselect ) {
		this.transclusions.focusPart( reselect.getName() );
	}

	if ( this.loaded && ( added || removed ) ) {
		this.altered = true;
	}

	this.setApplicableStatus();

	this.updateTitle();
};

/**
 * Handle add param events.
 *
 * @param {ve.dm.MWParameterModel} param Added param
 */
ve.ui.MWTemplateDialog.prototype.onAddParameter = function ( param ) {
	var page;

	if ( param.getName() ) {
		page = new ve.ui.MWParameterPage( param, param.getId(), { $overlay: this.$overlay, readOnly: this.isReadOnly() } );
	} else {
		// This branch is triggered when we receive a synthetic placeholder event with name=''.
		page = this.makePlaceholderPage( param );
	}
	this.bookletLayout.addPages( [ page ], this.transclusionModel.getIndex( param ) );
	if ( this.loaded ) {
		if ( !this.preventReselection ) {
			this.transclusions.focusPart( param.getId() );
		}

		this.altered = true;
		this.setApplicableStatus();

		if ( page instanceof ve.ui.MWParameterPage ) {
			page.updateSize();
		}
	} else {
		this.onAddParameterBeforeLoad( page );
	}
};

/**
 * Cache placeholder pages so they keep state if reused.
 *
 * @param {ve.dm.MWParameterModel} placeholder The not yet named parameter to choose and fill in
 * @return {ve.ui.MWParameterPlaceholderPage} A new or cached placeholder page
 */
ve.ui.MWTemplateDialog.prototype.makePlaceholderPage = function ( placeholder ) {
	var templateId = placeholder.getId(),
		// Reuse placeholder if possible to preserve the showAll state.
		page = this.templateParameterPlaceholderPages[ templateId ];

	if ( !page ) {
		page = new ve.ui.MWParameterPlaceholderPage( placeholder, templateId, {
			$overlay: this.$overlay
		} );
		this.templateParameterPlaceholderPages[ templateId ] = page;
	}

	page.toggle( true );
	return page;
};

/**
 * Additional handling of parameter addition events before loading.
 *
 * @param {ve.ui.MWParameterPage} page
 */
ve.ui.MWTemplateDialog.prototype.onAddParameterBeforeLoad = function () {};

/**
 * Handle remove param events.
 *
 * @param {ve.dm.MWParameterModel} param Removed param
 */
ve.ui.MWTemplateDialog.prototype.onRemoveParameter = function ( param ) {
	var page = this.bookletLayout.getPage( param.getId() ),
		reselect = this.bookletLayout.findClosestPage( page );

	// Select the desired page first. Otherwise, if the page we are removing is selected,
	// OOUI will try to select the first page after it is removed, and scroll to the top.
	if ( this.loaded && !this.preventReselection ) {
		this.transclusions.focusPart( reselect.getName() );
	}

	this.bookletLayout.removePages( [ page ] );

	if ( this.loaded ) {
		this.altered = true;
		this.setApplicableStatus();
	}
};

/**
 * Sets transclusion applicable status
 *
 * If the transclusion is empty or only contains a placeholder it will not be insertable.
 * If the transclusion only contains a placeholder it will not be editable.
 */
ve.ui.MWTemplateDialog.prototype.setApplicableStatus = function () {
	var parts = this.transclusionModel && this.transclusionModel.getParts();

	if ( parts.length && !( parts[ 0 ] instanceof ve.dm.MWTemplatePlaceholderModel ) ) {
		this.actions.setAbilities( { done: this.altered, insert: true } );
	} else {
		// Loading is resolved. We have either: 1) no parts, or 2) the a placeholder as the first part
		this.actions.setAbilities( { done: parts.length === 0 && this.altered, insert: false } );
	}
};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getBodyHeight = function () {
	return 400;
};

/**
 * Get a page for a transclusion part.
 *
 * @param {ve.dm.MWTransclusionModel} part Part to get page for
 * @return {OO.ui.PageLayout|null} Page for part, null if no matching page could be found
 */
ve.ui.MWTemplateDialog.prototype.getPageFromPart = function ( part ) {
	if ( part instanceof ve.dm.MWTemplateModel ) {
		return new ve.ui.MWTemplatePage( part, part.getId(), { $overlay: this.$overlay, isReadOnly: this.isReadOnly() } );
	} else if ( part instanceof ve.dm.MWTemplatePlaceholderModel ) {
		return new ve.ui.MWTemplatePlaceholderPage(
			part,
			part.getId(),
			{ $overlay: this.$overlay }
		);
	}
	return null;
};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getSelectedNode = function ( data ) {
	var selectedNode = ve.ui.MWTemplateDialog.super.prototype.getSelectedNode.call( this );

	// Data initialization
	data = data || {};

	// Require template to match if specified
	if ( selectedNode && data.template && !selectedNode.isSingleTemplate( data.template ) ) {
		return null;
	}

	return selectedNode;
};

/**
 * Update the dialog title.
 */
ve.ui.MWTemplateDialog.prototype.updateTitle = function () {
	var parts = this.transclusionModel && this.transclusionModel.getParts(),
		title = ve.msg( 'visualeditor-dialog-transclusion-loading' );

	if ( parts && parts.length === 1 && parts[ 0 ] ) {
		if ( parts[ 0 ] instanceof ve.dm.MWTemplateModel ) {
			title = ve.msg(
				this.getMode() === 'insert' ?
					'visualeditor-dialog-transclusion-title-insert-known-template' :
					'visualeditor-dialog-transclusion-title-edit-known-template',
				parts[ 0 ].getSpec().getLabel()
			);
		} else {
			title = ve.msg( 'visualeditor-dialog-transclusion-title-insert-template' );
		}
	}
	this.title.setLabel( title );
};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.initialize = function () {
	// Parent method
	ve.ui.MWTemplateDialog.super.prototype.initialize.call( this );

	// Properties
	this.bookletLayout = new OO.ui.BookletLayout( this.constructor.static.bookletLayoutConfig );
	this.transclusions = new ve.ui.MWTransclusionsBooklet( this.bookletLayout );

	// Initialization
	this.$content.addClass( 've-ui-mwTemplateDialog' );
	// bookletLayout is appended after the form has been built in getSetupProcess for performance
};

/**
 * If the user has left blank required parameters, confirm that they actually want to do this.
 * If no required parameters were left blank, or if they were but the user decided to go ahead
 *  anyway, the returned deferred will be resolved.
 * Otherwise, the returned deferred will be rejected.
 *
 * @return {jQuery.Deferred}
 */
ve.ui.MWTemplateDialog.prototype.checkRequiredParameters = function () {
	var blankRequired = [],
		deferred = ve.createDeferred();

	this.bookletLayout.stackLayout.getItems().forEach( function ( page ) {
		if ( !( page instanceof ve.ui.MWParameterPage ) ) {
			return;
		}
		if ( page.parameter.isRequired() && !page.valueInput.getValue() ) {
			blankRequired.push( mw.msg(
				'quotation-marks',
				page.parameter.template.getSpec().getParameterLabel( page.parameter.getName() )
			) );
		}
	} );
	if ( blankRequired.length ) {
		this.confirmDialogs.openWindow( 'requiredparamblankconfirm', {
			message: mw.msg(
				'visualeditor-dialog-transclusion-required-parameter-is-blank',
				mw.language.listToText( blankRequired ),
				blankRequired.length
			),
			title: mw.msg(
				'visualeditor-dialog-transclusion-required-parameter-dialog-title',
				blankRequired.length
			)
		} ).closed.then( function ( data ) {
			if ( data.action === 'ok' ) {
				deferred.resolve();
			} else {
				deferred.reject();
			}
		} );
	} else {
		deferred.resolve();
	}
	return deferred.promise();
};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getActionProcess = function ( action ) {
	var templateEvent, i,
		dialog = this;

	if ( action === 'done' || action === 'insert' ) {
		return new OO.ui.Process( function () {
			var deferred = ve.createDeferred();
			dialog.checkRequiredParameters().done( function () {
				var modelPromise, editCountBucket,
					surfaceModel = dialog.getFragment().getSurface(),
					obj = dialog.transclusionModel.getPlainObject();

				dialog.pushPending();

				if ( dialog.selectedNode instanceof ve.dm.MWTransclusionNode ) {
					dialog.transclusionModel.updateTransclusionNode( surfaceModel, dialog.selectedNode );
					// TODO: updating the node could result in the inline/block state change
					modelPromise = ve.createDeferred().resolve().promise();
				} else if ( obj !== null ) {
					// Collapse returns a new fragment, so update dialog.fragment
					dialog.fragment = dialog.getFragment().collapseToEnd();
					modelPromise = dialog.transclusionModel.insertTransclusionNode( dialog.getFragment() );
				}

				// TODO tracking will only be implemented temporarily to answer questions on
				// template usage for the Technical Wishes topic area see T258917
				templateEvent = {
					action: 'save',
					// eslint-disable-next-line camelcase
					template_names: []
				};
				editCountBucket = mw.config.get( 'wgUserEditCountBucket' );
				if ( editCountBucket !== null ) {
					// eslint-disable-next-line camelcase
					templateEvent.user_edit_count_bucket = editCountBucket;
				}
				for ( i = 0; i < dialog.transclusionModel.getParts().length; i++ ) {
					if ( dialog.transclusionModel.getParts()[ i ].getTitle ) {
						templateEvent.template_names.push( dialog.transclusionModel.getParts()[ i ].getTitle() );
					}
				}
				mw.track( 'event.VisualEditorTemplateDialogUse', templateEvent );

				return modelPromise.then( function () {
					dialog.close( { action: action } ).closed.always( dialog.popPending.bind( dialog ) );
				} );
			} ).always( deferred.resolve );

			return deferred;
		} );
	}

	return ve.ui.MWTemplateDialog.super.prototype.getActionProcess.call( this, action );
};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getSetupProcess = function ( data ) {
	data = data || {};
	return ve.ui.MWTemplateDialog.super.prototype.getSetupProcess.call( this, data )
		.next( function () {
			var template, promise, templateEvent, i, editCountBucket,
				dialog = this;

			// Properties
			this.loaded = false;
			this.altered = false;
			this.transclusionModel = new ve.dm.MWTransclusionModel( this.getFragment().getDocument() );

			// Events
			this.transclusionModel.connect( this, {
				replace: 'onReplacePart',
				change: 'onTransclusionModelChange'
			} );

			// Detach the form while building for performance
			this.bookletLayout.$element.detach();
			// HACK: Prevent any setPage() calls (from #onReplacePart) from focussing stuff, it messes
			// with OOUI logic for marking fields as invalid (T199838). We set it back to true below.
			this.bookletLayout.autoFocus = false;

			// Initialization
			if ( !this.selectedNode ) {
				if ( data.template ) {
					// New specified template
					template = ve.dm.MWTemplateModel.newFromName(
						this.transclusionModel, data.template
					);
					promise = this.transclusionModel.addPart( template ).then(
						this.initializeNewTemplateParameters.bind( this )
					);
				} else {
					// New template placeholder
					promise = this.transclusionModel.addPart(
						new ve.dm.MWTemplatePlaceholderModel( this.transclusionModel )
					);
				}
			} else {
				// Load existing template

				// TODO tracking will only be implemented temporarily to answer questions on
				// template usage for the Technical Wishes topic area see T258917
				templateEvent = {
					action: 'edit',
					// eslint-disable-next-line camelcase
					template_names: []
				};
				editCountBucket = mw.config.get( 'wgUserEditCountBucket' );
				if ( editCountBucket !== null ) {
					// eslint-disable-next-line camelcase
					templateEvent.user_edit_count_bucket = editCountBucket;
				}
				for ( i = 0; i < this.selectedNode.partsList.length; i++ ) {
					if ( this.selectedNode.partsList[ i ].templatePage ) {
						templateEvent.template_names.push( this.selectedNode.partsList[ i ].templatePage );
					}
				}
				mw.track( 'event.VisualEditorTemplateDialogUse', templateEvent );

				promise = this.transclusionModel
					.load( ve.copy( this.selectedNode.getAttribute( 'mw' ) ) )
					.then( this.initializeTemplateParameters.bind( this ) );
			}
			this.actions.setAbilities( { done: false, insert: false } );

			return promise.then( function () {
				// Add missing required and suggested parameters to each transclusion.
				dialog.transclusionModel.addPromptedParameters();

				dialog.loaded = true;
				dialog.$element.addClass( 've-ui-mwTemplateDialog-ready' );

				// FIXME: Proof-of-concept for T274543, to be removed.  None of
				// this code will be needed, instead the bookletLayout will
				// instantiate the appropriate sidebar.
				if ( mw.config.get( 'wgVisualEditorConfig' ).transclusionDialogNewSidebar ) {
					var intRange = [];
					for ( var index = 0; index < 40; index++ ) {
						intRange.push( index );
					}
					var template1 = new ve.ui.MWTemplateOutlineTemplateWidget( {
						// Generate sample data.
						items: intRange.map(
							function ( j ) {
								return new ve.ui.MWTemplateOutlineParameterCheckboxWidget( {
									required: j < 5,
									// TODO: Label can be a passed as an unevaluated lazy message function.
									label: 'Parameter number ' + ( j + 1 ) + ' plus long text continuation',
									selected: j % 2
								} );
							}
						)
					} );
					var pocSidebar = new ve.ui.MWTransclusionOutlineContainerWidget( {
						items: template1
					} );
					dialog.bookletLayout.$element.find( '.oo-ui-outlineSelectWidget' )
						.empty()
						.append( pocSidebar.$element );
				}

				dialog.$body.append( dialog.bookletLayout.$element );

				dialog.bookletLayout.autoFocus = true;
			} );
		}, this );
};

/**
 * Initialize parameters for new template insertion
 */
ve.ui.MWTemplateDialog.prototype.initializeNewTemplateParameters = function () {
	var i, parts = this.transclusionModel.getParts();
	for ( i = 0; i < parts.length; i++ ) {
		if ( parts[ i ] instanceof ve.dm.MWTemplateModel ) {
			parts[ i ].addPromptedParameters();
		}
	}
};

/**
 * Intentionally empty. This is provided for Wikia extensibility.
 */
ve.ui.MWTemplateDialog.prototype.initializeTemplateParameters = function () {};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getTeardownProcess = function ( data ) {
	return ve.ui.MWTemplateDialog.super.prototype.getTeardownProcess.call( this, data )
		.first( function () {
			// Cleanup
			this.$element.removeClass( 've-ui-mwTemplateDialog-ready' );
			this.transclusionModel.disconnect( this );
			this.transclusionModel.abortRequests();
			this.transclusionModel = null;
			this.bookletLayout.clearPages();
			this.content = null;
		}, this );
};
