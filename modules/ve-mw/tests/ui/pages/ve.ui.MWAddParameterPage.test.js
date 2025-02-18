QUnit.module( 've.ui.MWAddParameterPage', ve.test.utils.mwEnvironment );

QUnit.test( 'Input event handler', ( assert ) => {
	const transclusion = new ve.dm.MWTransclusionModel(),
		template = new ve.dm.MWTemplateModel( transclusion, {} ),
		parameter = new ve.dm.MWParameterModel( template ),
		page = new ve.ui.MWAddParameterPage( parameter );

	page.paramInputField.setValue( ' ' );
	page.onParameterInput();
	assert.deepEqual( template.getParameters(), {}, 'empty input is ignored' );

	page.paramInputField.setValue( ' p1 ' );
	page.onParameterInput();
	assert.ok( template.hasParameter( 'p1' ), 'input is trimmed and parameter added' );

	template.getParameter( 'p1' ).setValue( 'not empty' );
	page.paramInputField.setValue( 'p1' );
	page.onParameterInput();
	assert.ok( template.getParameter( 'p1' ).getValue(), 'existing parameter is not replaced' );

	template.getSpec().setTemplateData( { params: { documented: {} } } );
	page.paramInputField.setValue( 'documented' );
	page.onParameterInput();
	assert.notOk( template.hasParameter( 'documented' ), 'documented parameter is not added' );

} );

QUnit.test( 'Outline item initialization', ( assert ) => {
	const transclusion = new ve.dm.MWTransclusionModel(),
		template = new ve.dm.MWTemplateModel( transclusion, {} ),
		parameter = new ve.dm.MWParameterModel( template ),
		page = new ve.ui.MWAddParameterPage( parameter );

	page.setOutlineItem( new OO.ui.OutlineOptionWidget() );
	const outlineItem = page.getOutlineItem();

	assert.notOk( outlineItem.$element.children().length,
		'Outline item should be empty' );
	// eslint-disable-next-line no-jquery/no-class-state
	assert.notOk( outlineItem.$element.hasClass( 'oo-ui-outlineOptionWidget' ),
		'Outline item should not be styled' );
} );
