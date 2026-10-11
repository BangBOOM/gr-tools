/** WebGL2 GR Preview: renders a native recipe per pixel from the photo's latent (Standard matrix output) exactly like `evaluateLatent` in `packages/firmware-fit/src/index.ts`. */
import {MODEL} from '../../packages/color-engine/index.ts';
import type {Recipe} from '../../packages/firmware-fit/src/index.ts';
import {cameraMatrix,workingTables} from '../../packages/color-engine/camera.ts';
const VERTEX=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`;
// Float32 reproduces the float64 CPU evaluator within one 8-bit code (research-archive measurement).
const FRAGMENT=`#version 300 es
precision highp float;precision highp int;
uniform sampler2D sourceTex,tableTex;uniform mat3 matrix,r0,ycc,yccInverse;uniform vec3 hKnots,hValues,hSlopes;uniform vec4 cKnots,cValues,cSlopes;uniform int height;out vec4 color;
float grid(sampler2D table,int size,int row,float x){float z=clamp(x,0.,1.)*float(size-1);int i=min(int(floor(z)),size-2);return mix(texelFetch(table,ivec2(i,row),0).r,texelFetch(table,ivec2(i+1,row),0).r,z-float(i));}
// Piecewise curves of packages/color-engine/camera.ts: segment k starts at knot k with value k and slope k (divisor applied by the host).
float h(float x){int k=x>=hKnots.z?2:x>=hKnots.y?1:0;return hValues[k]+hSlopes[k]*(x-hKnots[k]);}
float c(float x){int k=x>=cKnots.w?3:x>=cKnots.z?2:x>=cKnots.y?1:0;return cValues[k]+cSlopes[k]*(x-cKnots[k]);}
void main(){
  vec3 z=matrix*texelFetch(sourceTex,ivec2(int(gl_FragCoord.x),height-1-int(gl_FragCoord.y)),0).rgb;
  // MultiAxial record 0 blended by the chroma curve h on the signed matrix output; clip; working tables H=F∘G; YCbCrOperation chroma gain c(Y′)/512.
  float w=h(clamp(floor(4095.*(max(z.r,max(z.g,z.b))-min(z.r,min(z.g,z.b)))),0.,4095.))/2048.;
  vec3 p=clamp(z+w*(r0*z-z),0.,1.),y=vec3(grid(tableTex,257,0,p.r),grid(tableTex,257,1,p.g),grid(tableTex,257,2,p.b)),t=ycc*y;
  float gain=max(c(floor(1023.*t.x+.5)),0.)/512.;
  color=vec4(clamp(yccInverse*vec3(t.x,t.y*gain,t.z*gain),0.,1.),1.);
}`;
export type GRPreview={canvas:HTMLCanvasElement;render(latent:Float32Array,width:number,height:number,recipe:Recipe):HTMLCanvasElement};
/** Returns null when WebGL2 is unavailable. Uploads the latent only when the photo buffer changes and the recipe only when it changes. */
export function createGRPreview():GRPreview|null{
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{antialias:false,depth:false,premultipliedAlpha:false});
  if(!gl)return null;
  const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)??'GR Preview shader failed');return s;};
  const program=gl.createProgram()!;gl.attachShader(program,shader(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)??'GR Preview program failed');
  gl.useProgram(program);gl.bindVertexArray(gl.createVertexArray());
  const at=(name:string)=>gl.getUniformLocation(program,name);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  // One texture per unit; later uploads replace its contents.
  for(const [unit,name] of ['sourceTex','tableTex'].entries()){
    gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
    for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);gl.uniform1i(at(name),unit);
  }
  const texture=(unit:number,width:number,height:number,format:number,data:Float32Array)=>{
    gl.activeTexture(gl.TEXTURE0+unit);gl.texImage2D(gl.TEXTURE_2D,0,format,width,height,0,format===gl.RGB32F?gl.RGB:gl.RED,gl.FLOAT,data);
  };
  // Column-major upload of a row-major matrix.
  const columns=(m:number[][])=>Float32Array.from([0,1,2].flatMap(c=>[0,1,2].map(r=>m[r][c])));
  const inverse3=(m:number[][])=>{const [a,b,c]=m[0],[d,e,f]=m[1],[g,h,i]=m[2],det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);return [[(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det],[(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det],[(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det]];};
  const ycc=MODEL.ycbcr.matrix_q8.map(r=>r.map(v=>v/256)),ma=MODEL.multiaxial,yc=MODEL.ycbcr;
  gl.uniformMatrix3fv(at('r0'),false,columns(ma.r0_q10.map(r=>r.map(v=>v/1024))));gl.uniformMatrix3fv(at('ycc'),false,columns(ycc));gl.uniformMatrix3fv(at('yccInverse'),false,columns(inverse3(ycc)));
  gl.uniform3fv(at('hKnots'),ma.knots);gl.uniform3fv(at('hValues'),ma.values);gl.uniform3fv(at('hSlopes'),ma.slopes.map(v=>v/ma.divisor));
  gl.uniform4fv(at('cKnots'),yc.knots);gl.uniform4fv(at('cValues'),yc.values);gl.uniform4fv(at('cSlopes'),yc.slopes.map(v=>v/yc.divisor));
  let source:Float32Array|null=null,current:Recipe|null=null;
  return {canvas,render(latent,width,height,recipe){
    if(latent!==source){source=latent;canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);texture(0,width,height,gl.RGB32F,latent);gl.uniform1i(at('height'),height);}
    if(recipe!==current){
      current=recipe;texture(1,257,3,gl.R32F,Float32Array.from(workingTables(recipe.curves_q14).flat()));
      gl.uniformMatrix3fv(at('matrix'),false,columns(cameraMatrix(recipe.matrix_q13)));
    }
    gl.drawArrays(gl.TRIANGLES,0,3);return canvas;
  }};
}
