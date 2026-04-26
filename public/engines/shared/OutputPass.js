import {
	ShaderMaterial,
	UniformsUtils
} from '/lib/three/three.module.js';
import { Pass, FullScreenQuad } from '/lib/three/postprocessing/Pass.js';

const OutputShader = {
	name: 'OutputShader',
	uniforms: {
		'tDiffuse': { value: null },
		'toneMappingExposure': { value: 1.0 }
	},
	vertexShader: `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}
	`,
	fragmentShader: `
		uniform sampler2D tDiffuse;
		varying vec2 vUv;
		void main() {
			gl_FragColor = texture2D( tDiffuse, vUv );
			#include <tonemapping_fragment>
			#include <colorspace_fragment>
		}
	`
};

class OutputPass extends Pass {
	constructor() {
		super();
		this.material = new ShaderMaterial( {
			name: OutputShader.name,
			uniforms: UniformsUtils.clone( OutputShader.uniforms ),
			vertexShader: OutputShader.vertexShader,
			fragmentShader: OutputShader.fragmentShader,
		} );
		this.fsQuad = new FullScreenQuad( this.material );
	}

	render( renderer, writeBuffer, readBuffer ) {
		this.material.uniforms[ 'tDiffuse' ].value = readBuffer.texture;
		this.material.uniforms[ 'toneMappingExposure' ].value = renderer.toneMappingExposure;

		if ( this.renderToScreen ) {
			renderer.setRenderTarget( null );
			this.fsQuad.render( renderer );
		} else {
			renderer.setRenderTarget( writeBuffer );
			if ( this.clear ) renderer.clear();
			this.fsQuad.render( renderer );
		}
	}

	dispose() {
		this.material.dispose();
		this.fsQuad.dispose();
	}
}

export { OutputPass };
