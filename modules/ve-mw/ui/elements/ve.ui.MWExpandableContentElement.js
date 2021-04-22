/**
 * Container for textual elements, which should be collapsed to one line by default.
 *
 * A "more / less" button is used to toggle additional lines.
 *
 * @class
 * @extends OO.ui.Element
 * @mixins OO.EventEmitter
 *
 * @constructor
 * @param {Object} [config] Configuration options
 */
ve.ui.MWExpandableContentElement = function VeUiMWExpandableContentElement( config ) {
	// Parent constructor
	ve.ui.MWExpandableContentElement.super.call( this, config );

	// Mixin constructors
	OO.EventEmitter.call( this );

	this.$content = config.$content;

	this.collapsed = false;
	this.toggle( false );
};

/* Inheritance */

OO.inheritClass( ve.ui.MWExpandableContentElement, OO.ui.Element );

OO.mixinClass( ve.ui.MWExpandableContentElement, OO.EventEmitter );

/* Methods */

ve.ui.MWExpandableContentElement.prototype.getLineHeight = function () {
	return parseInt( this.$content.css( 'line-height' ) );
};

ve.ui.MWExpandableContentElement.prototype.makeCollapsible = function () {
	this.$content.addClass( 've-ui-expandableContent-collapsible' );

	var collapsedHeight = this.getLineHeight() * 1.25;
	var toggle = new OO.ui.ButtonWidget( {
		framed: false,
		flags: [ 'progressive' ],
		label: ve.msg( 'visualeditor-expandable-more' )
	} );
	var element = this;
	toggle.on( 'click', function () {
		if ( element.collapsed ) {
			toggle.setLabel( ve.msg( 'visualeditor-expandable-more' ) );
			element.$content.css( { height: collapsedHeight } );
		} else {
			toggle.setLabel( ve.msg( 'visualeditor-expandable-less' ) );
			element.$content.css( { height: element.$content.prop( 'scrollHeight' ) + collapsedHeight } );
		}
		element.collapsed = !element.collapsed;
	} );

	$( '<div>' )
		.addClass( 've-ui-expandableContent-fade' )
		.append( toggle.$element )
		.height( collapsedHeight )
		.appendTo( this.$element );

	this.$content.height( collapsedHeight );
};

ve.ui.MWExpandableContentElement.prototype.updateSize = function () {
	this.toggle( true );

	if ( this.$content.outerHeight() / this.getLineHeight() >= 3 ) {
		this.makeCollapsible();
	}
};
