/*!
 * VisualEditor user interface MWTransclusionOutlineParameterWidget class.
 *
 * @license The MIT License (MIT); see LICENSE.txt
 */

/**
 * A widget that represents a template parameter, with a checkbox to add/remove the parameter.
 * Modelled after {@see OO.ui.OutlineOptionWidget}. Also see {@see OO.ui.CheckboxMultioptionWidget}
 * for inspiration.
 *
 * @class
 * @extends OO.ui.OptionWidget
 *
 * @constructor
 * @param {Object} config
 * @cfg {string} data Parameter name
 * @cfg {string} label
 * @cfg {boolean} [required=false] Required parameters can't be unchecked
 * @cfg {boolean} [selected=false] If the parameter is currently used (checked)
 * @cfg {boolean} [hasValue=false] If the parameter has a value that's not empty
 */
ve.ui.MWTransclusionOutlineParameterWidget = function VeUiMWTransclusionOutlineParameterWidget( config ) {
	this.checkbox = new OO.ui.CheckboxInputWidget( {
		title: config.required ?
			ve.msg( 'visualeditor-dialog-transclusion-required-parameter' ) :
			null,
		disabled: config.required,
		selected: config.selected || config.required,
		// Keyboard navigation is handled by the outer OO.ui.SelectWidget
		tabIndex: -1
	} )
		.connect( this, {
			// The array syntax is a way to call `this.emit( 'change' )`.
			change: [ 'emit', 'change' ]
		} );
	this.checkbox.$input.on( {
		mousedown: this.onMouseDown.bind( this )
	} );

	// Parent constructor
	ve.ui.MWTransclusionOutlineParameterWidget.super.call( this, ve.extendObject( config, {
		classes: [ 've-ui-mwTransclusionOutlineParameterWidget' ],
		$label: $( '<label>' )
	} ) );

	this.toggleHasValue( config.hasValue );

	// Initialization
	this.$element
		.append( this.checkbox.$element, this.$label );
};

/* Inheritance */

OO.inheritClass( ve.ui.MWTransclusionOutlineParameterWidget, OO.ui.OptionWidget );

/* Methods */

/**
 * @private
 * @param {jQuery.Event} e
 */
ve.ui.MWTransclusionOutlineParameterWidget.prototype.onMouseDown = function ( e ) {
	// Mouse clicks conflict with the click handler in {@see OO.ui.SelectWidget}
	e.stopPropagation();
};

/**
 * @inheritDoc OO.ui.OptionWidget
 */
ve.ui.MWTransclusionOutlineParameterWidget.prototype.setSelected = function ( state ) {
	// Never uncheck a required parameter
	state = state || this.checkbox.isDisabled();

	this.checkbox.setSelected( state, true );
	ve.ui.MWTransclusionOutlineParameterWidget.super.prototype.setSelected.call( this, state );

	return this;
};

ve.ui.MWTransclusionOutlineParameterWidget.prototype.setParameter = function ( state ) {
	this.$element.toggleClass( 've-ui-mwTransclusionOutlineParameterWidget-isSet', state );
};

/**
 * @param {boolean} hasValue
 */
ve.ui.MWTransclusionOutlineParameterWidget.prototype.toggleHasValue = function ( hasValue ) {
	this.$element.toggleClass( 've-ui-mwTransclusionOutlineParameterWidget-hasValue', hasValue );
};

/**
 * Custom method to scroll parameter into view respecting the sticky part that sits above
 */
ve.ui.MWTransclusionOutlineParameterWidget.prototype.scrollToView = function () {
	// make sure parameter is visible and scrolled underneath the sticky
	// TODO find a dynamic way to get height of the sticky part
	this.scrollElementIntoView( { padding: { top: 115 } } );
};
