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
	this.expandedParamList = {};
	this.useNewSidebar = mw.config.get( 'wgVisualEditorConfig' ).transclusionDialogNewSidebar;

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
 * Configuration for the {@see OO.ui.BookletLayout} used in this dialog.
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
 *
 * @private
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
 * @protected
 * @param {ve.dm.MWTransclusionPartModel|null} removed Removed part
 * @param {ve.dm.MWTransclusionPartModel|null} added Added part
 */
ve.ui.MWTemplateDialog.prototype.onReplacePart = function ( removed, added ) {
	var reselect,
		removePages = [];

	if ( removed ) {
		// Remove parameter pages of removed templates
		var partPage = this.bookletLayout.getPage( removed.getId() );
		if ( removed instanceof ve.dm.MWTemplateModel ) {
			var params = removed.getParameters();
			for ( var name in params ) {
				removePages.push( this.bookletLayout.getPage( params[ name ].getId() ) );
				delete this.expandedParamList[ params[ name ].getId() ];
			}
			removed.disconnect( this );
		}
		if ( this.loaded && !this.preventReselection && partPage.isActive() ) {
			var closestPage = this.bookletLayout.findClosestPage( partPage );
			reselect = closestPage && closestPage.getName();
		}
		removePages.push( partPage );
		this.bookletLayout.removePages( removePages );
	}

	if ( added ) {
		var page = this.getPageFromPart( added );
		if ( page ) {
			this.bookletLayout.addPages( [ page ], this.transclusionModel.getIndex( added ) );
			if ( reselect ) {
				// Use added page instead of closest page
				reselect = added.getId();
			}

			if ( added instanceof ve.dm.MWTemplateModel ) {
				// Prevent selection changes while parameters are added
				this.preventReselection = true;

				// Add existing params to templates (the template might be being moved)
				var names = added.getOrderedParameterNames();
				for ( var i = 0; i < names.length; i++ ) {
					this.onAddParameter( added.getParameter( names[ i ] ) );
				}
				added.connect( this, { add: 'onAddParameter', remove: 'onRemoveParameter' } );

				// Add required and suggested params to user created templates
				var shouldAddPlaceholder = this.loaded && added.addPromptedParameters() === 0;

				this.preventReselection = false;

				if ( names.length ) {
					// Focus the first element when parameters are present
					reselect = added.getParameter( names[ 0 ] ).getId();
				} else if ( shouldAddPlaceholder && !this.useNewSidebar ) {
					page.addPlaceholderParameter();
				}

				if ( this.useNewSidebar ) {
					var documentedParameters = added.getSpec().getDocumentedParameterOrder(),
						undocumentedParameters = added.getSpec().getUndocumentedParameterNames();

					if ( !documentedParameters.length || undocumentedParameters.length ) {
						page.addPlaceholderParameter();
					}
				}
			}
		}
	}

	if ( reselect ) {
		this.focusPart( reselect );
	}

	if ( this.loaded && ( added || removed ) ) {
		this.altered = true;
	}

	this.setApplicableStatus();
	this.updateTitle();
};

/**
 * Respond to showAll event in the placeholder page.
 * Cache this so we can make sure the parameter list is expanded
 * when we next load this same pageId placeholder.
 *
 * @param {string} pageId Page Id
 */
ve.ui.MWTemplateDialog.prototype.onParameterPlaceholderShowAll = function ( pageId ) {
	this.expandedParamList[ pageId ] = true;
};

/**
 * Handle add param events.
 *
 * @private
 * @param {ve.dm.MWParameterModel} param Added param
 */
ve.ui.MWTemplateDialog.prototype.onAddParameter = function ( param ) {
	var page;

	if ( param.getName() ) {
		page = new ve.ui.MWParameterPage( param, param.getId(), { $overlay: this.$overlay, readOnly: this.isReadOnly() } );
	} else if ( this.useNewSidebar ) {
		page = new ve.ui.MWAddParameterPage( param, param.getId(), {
			$overlay: this.$overlay
		} );
	} else {
		// This branch is triggered when we receive a synthetic placeholder event with name=''.
		page = new ve.ui.MWParameterPlaceholderPage( param, param.getId(), {
			$overlay: this.$overlay,
			expandedParamList: !!this.expandedParamList[ param.getId() ]
		} )
			.connect( this, { showAll: 'onParameterPlaceholderShowAll' } );
	}
	this.bookletLayout.addPages( [ page ], this.transclusionModel.getIndex( param ) );
	if ( this.loaded ) {
		if ( !this.preventReselection ) {
			this.focusPart( param.getId() );
		}

		this.altered = true;
		this.setApplicableStatus();

		if ( page instanceof ve.ui.MWParameterPage ) {
			page.updateSize();
		}
	}
};

/**
 * Handle remove param events.
 *
 * @private
 * @param {ve.dm.MWParameterModel} param Removed param
 */
ve.ui.MWTemplateDialog.prototype.onRemoveParameter = function ( param ) {
	var page = this.bookletLayout.getPage( param.getId() ),
		reselect = this.bookletLayout.findClosestPage( page );

	// Select the desired page first. Otherwise, if the page we are removing is selected,
	// OOUI will try to select the first page after it is removed, and scroll to the top.
	if ( this.loaded && !this.preventReselection ) {
		this.focusPart( reselect.getName() );
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
 *
 * @private
 */
ve.ui.MWTemplateDialog.prototype.setApplicableStatus = function () {
	var parts = this.transclusionModel && this.transclusionModel.getParts(),
		startsWithPlaceholder = parts && parts[ 0 ] instanceof ve.dm.MWTemplatePlaceholderModel,
		canSave = !startsWithPlaceholder;

	this.actions.setAbilities( { done: canSave && this.altered } );
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
 * @protected
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
 *
 * @protected
 */
ve.ui.MWTemplateDialog.prototype.updateTitle = function () {
	var parts = this.transclusionModel && this.transclusionModel.getParts(),
		title = ve.msg( 'visualeditor-dialog-transclusion-loading' );

	if ( parts && parts.length === 1 ) {
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
 * @private
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
	var dialog = this;

	if ( action === 'done' ) {
		return new OO.ui.Process( function () {
			var deferred = ve.createDeferred();
			dialog.checkRequiredParameters().done( function () {
				var surfaceModel = dialog.getFragment().getSurface(),
					obj = dialog.transclusionModel.getPlainObject(),
					modelPromise = ve.createDeferred().resolve().promise();

				dialog.pushPending();

				if ( dialog.selectedNode instanceof ve.dm.MWTransclusionNode ) {
					dialog.transclusionModel.updateTransclusionNode( surfaceModel, dialog.selectedNode );
					// TODO: updating the node could result in the inline/block state change
				} else if ( obj !== null ) {
					// Collapse returns a new fragment, so update dialog.fragment
					dialog.fragment = dialog.getFragment().collapseToEnd();
					modelPromise = dialog.transclusionModel.insertTransclusionNode( dialog.getFragment() );
				}

				// TODO tracking will only be implemented temporarily to answer questions on
				// template usage for the Technical Wishes topic area see T258917
				var templateEvent = {
					action: 'save',
					// eslint-disable-next-line camelcase
					template_names: []
				};
				var editCountBucket = mw.config.get( 'wgUserEditCountBucket' );
				if ( editCountBucket !== null ) {
					// eslint-disable-next-line camelcase
					templateEvent.user_edit_count_bucket = editCountBucket;
				}
				for ( var i = 0; i < dialog.transclusionModel.getParts().length; i++ ) {
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
			var promise,
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

			if ( this.useNewSidebar ) {
				// FIXME: This is created at the wrong time. That's why we run into the situation
				//  where an old instance exists. Should be in initialize().
				if ( !this.pocSidebar ) {
					this.pocSidebar = new ve.ui.MWTransclusionOutlineContainerWidget();
					this.pocSidebar.connect( this, {
						focusPageByName: 'focusPart',
						filterPagesByName: 'onFilterPagesByName'
					} );
					// FIXME: Check if we can merge these two "set"/"focusin" event handlers
					this.bookletLayout.connect( this, {
						set: 'onBookletLayoutSetPage'
					} );
					this.bookletLayout.stackLayout.$element.on(
						'focusin',
						this.onBookletLayoutPageFocused.bind( this )
					);
				} else {
					this.pocSidebar.clear();
				}
				this.transclusionModel.connect( this.pocSidebar, {
					replace: 'onReplacePart',
					change: [ 'onTransclusionModelChange', this.transclusionModel ]
				} );
			}

			// Initialization
			if ( !this.selectedNode ) {
				if ( data.template ) {
					// New specified template
					var template = ve.dm.MWTemplateModel.newFromName(
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
				var templateEvent = {
					action: 'edit',
					// eslint-disable-next-line camelcase
					template_names: []
				};
				var editCountBucket = mw.config.get( 'wgUserEditCountBucket' );
				if ( editCountBucket !== null ) {
					// eslint-disable-next-line camelcase
					templateEvent.user_edit_count_bucket = editCountBucket;
				}
				for ( var i = 0; i < this.selectedNode.partsList.length; i++ ) {
					if ( this.selectedNode.partsList[ i ].templatePage ) {
						templateEvent.template_names.push( this.selectedNode.partsList[ i ].templatePage );
					}
				}
				mw.track( 'event.VisualEditorTemplateDialogUse', templateEvent );

				promise = this.transclusionModel
					.load( ve.copy( this.selectedNode.getAttribute( 'mw' ) ) )
					.then( this.initializeTemplateParameters.bind( this ) );
			}
			this.actions.setAbilities( { done: false } );

			return promise.then( function () {
				// Add missing required and suggested parameters to each transclusion.
				dialog.transclusionModel.addPromptedParameters();

				dialog.loaded = true;
				dialog.$element.addClass( 've-ui-mwTemplateDialog-ready' );

				dialog.$body.append( dialog.bookletLayout.$element );
				if ( dialog.pocSidebar ) {
					// TODO: bookletLayout will be deprecated.
					var $debugContainer = dialog.bookletLayout.outlinePanel.$element
						.children( '.ve-ui-mwTemplateDialog-pocSidebar-debug-container' );
					if ( !$debugContainer.length ) {
						$debugContainer = $( '<div>' )
							.addClass( 've-ui-mwTemplateDialog-pocSidebar-debug-container' )
							.prependTo( dialog.bookletLayout.outlinePanel.$element );
					}
					$debugContainer.append(
						dialog.pocSidebar.$element,
						dialog.bookletLayout.outlineSelectWidget.$element
					);
					dialog.bookletLayout.outlineSelectWidget.toggle( false );
				}

				dialog.bookletLayout.autoFocus = true;
			} );
		}, this );
};

/**
 * Initialize parameters for new template insertion
 *
 * @private
 */
ve.ui.MWTemplateDialog.prototype.initializeNewTemplateParameters = function () {
	var parts = this.transclusionModel.getParts();
	for ( var i = 0; i < parts.length; i++ ) {
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
 * @private
 */
ve.ui.MWTemplateDialog.prototype.onFilterPagesByName = function ( visibility ) {
	for ( var pageName in visibility ) {
		var page = this.bookletLayout.getPage( pageName );
		if ( page ) {
			page.toggle( visibility[ pageName ] );
		}
	}
};

/**
 * @private
 * @param {string} pageName
 */
ve.ui.MWTemplateDialog.prototype.focusPart = function ( pageName ) {
	// The new sidebar does not focus template parameters, only top-level parts
	if ( this.pocSidebar && pageName.indexOf( '/' ) === -1 ) {
		// FIXME: This is currently needed because the event that adds a new part to the new sidebar
		//  is executed later than this here.
		setTimeout( this.pocSidebar.selectPartById.bind( this.pocSidebar, pageName ) );
		this.bookletLayout.focus();
		this.bookletLayout.setPage( pageName );
	} else if ( this.bookletLayout.isOutlined() ) {
		this.bookletLayout.getOutline().selectItemByData( pageName );
	} else {
		this.bookletLayout.setPage( pageName );
	}
};

/**
 * @private
 * @param {OO.ui.PageLayout} page
 */
ve.ui.MWTemplateDialog.prototype.onBookletLayoutSetPage = function ( page ) {
	// FIXME: This triggers twice for the same page. Why?

	// The sidebar (currently) can't focus individual template parameters with composite ids like
	// "part_1/param1". Make sure at least the top-level part is focused.
	var partId = page.getName().split( '/', 2 )[ 0 ];
	this.pocSidebar.selectPartById( partId );
};

/**
 * Modeled after {@see OO.ui.BookletLayout.onStackLayoutFocus}.
 *
 * @private
 * @param {jQuery.Event} e
 */
ve.ui.MWTemplateDialog.prototype.onBookletLayoutPageFocused = function ( e ) {
	var $focusedPage = $( e.target ).closest( '.oo-ui-pageLayout' );
	for ( var pageName in this.bookletLayout.pages ) {
		if ( this.bookletLayout.getPage( pageName ).$element[ 0 ] === $focusedPage[ 0 ] ) {
			this.pocSidebar.highlightSubItemByPageName( pageName );
			break;
		}
	}
};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getTeardownProcess = function ( data ) {
	return ve.ui.MWTemplateDialog.super.prototype.getTeardownProcess.call( this, data )
		.first( function () {
			// Cleanup
			this.$element.removeClass( 've-ui-mwTemplateDialog-ready' );
			this.transclusionModel.disconnect( this );
			this.transclusionModel.abortAllApiRequests();
			this.transclusionModel = null;
			this.bookletLayout.clearPages();
			this.content = null;
		}, this );
};
