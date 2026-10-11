import assert from 'node:assert/strict';
import {validateDNG,validateSettings,cropGeometry,sourceXY,decodeLibRaw,sampleLut,whiteBalanceOptions,validateDimensions,validateLut,rawDefaults} from '../core.ts'
import {developStandard,latent,STANDARD_MATRIX,STANDARD_CHAIN,renderLatent,multiaxial,ycbcrOperation} from '../../color-engine/camera.ts';
import {bakeLut,MODEL} from '../../color-engine/index.ts';
function dng(le=true){const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);bytes[0]=bytes[1]=le?73:77;v.setUint16(2,42,le);v.setUint32(4,8,le);v.setUint16(8,1,le);v.setUint16(10,50706,le);v.setUint16(12,1,le);v.setUint32(14,4,le);bytes[18]=1;bytes[19]=4;return bytes;}
for(const little of [true,false]){const valid=dng(little);validateDNG(valid);const padded=new Uint8Array(40);padded.set(valid,4);validateDNG(padded.subarray(4,36));}
for(const mutate of [(b:Uint8Array)=>b[0]=0,(b:Uint8Array)=>b[2]=0,(b:Uint8Array)=>b[4]=255,(b:Uint8Array)=>b[8]=255,(b:Uint8Array)=>b[10]=0,(b:Uint8Array)=>b[18]=0]){const b=dng();mutate(b);assert.throws(()=>validateDNG(b));}
assert.throws(()=>validateDNG(dng().subarray(0,25)));assert.throws(()=>validateDNG(new Uint8Array(4)));
for(const s of [null,[],{...rawDefaults,wb:'daylight'},{...rawDefaults,exposure:NaN},{...rawDefaults,exposure:true},{...rawDefaults,temperature:101},{...rawDefaults,extra:1}])assert.throws(()=>validateSettings(s as any));
assert.deepEqual(validateSettings(rawDefaults),rawDefaults);
const m={left_margin:10,top_margin:20,raw_inset_crops:[{cleft:11,ctop:21,cwidth:3,cheight:2}]};
for(const [flip,expected] of [[0,[0,1,2,10,11,12]],[3,[12,11,10,2,1,0]],[5,[2,12,1,11,0,10]],[6,[10,0,11,1,12,2]]] as const){const g=cropGeometry({...m,flip},5,4),actual=[];for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const [sx,sy]=sourceXY(g,x,y);actual.push((sy-1)*10+(sx-1));}assert.deepEqual(actual,expected);}
assert.throws(()=>cropGeometry({...m,flip:1},5,4));assert.throws(()=>cropGeometry(m,2,2));
assert.deepEqual(cropGeometry({flip:0,raw_inset_crops:[]},3,2),{x:0,y:0,w:3,h:2,flip:0,width:3,height:2});
// LibRaw's default curve: 4.5x below 0.01805, then 1.0993x^0.45-0.0993.
assert.ok(Math.abs(decodeLibRaw(.045)-.01)<1e-12);assert.ok(Math.abs(decodeLibRaw(1.0992578062*.25**(1/2.222)-.0992578062)-.25)<1e-12);assert.ok(Math.abs(decodeLibRaw(1)-1)<1e-12);assert.equal(decodeLibRaw(0),0);
// The developed photo: neutral camera RGB stays neutral through Bstd x D, MultiAxial, G and YCbCrOperation; the latent round-trips through the inverse chain.
assert.deepEqual(developStandard([0,0,0]),[0,0,0]);assert.ok(developStandard([1,1,1]).every(v=>Math.abs(v-1)<1e-9));assert.ok(developStandard([.5,.5,.5]).every(v=>Math.abs(v-MODEL.gamma[128])<1e-9));
assert.ok(STANDARD_MATRIX.every(row=>Math.abs(row[0]+row[1]+row[2]-1)<1e-9));
for(const z of [[.3,.2,.1],[.9,.4,.05],[.02,.03,.5]]){const back=latent(renderLatent(z,STANDARD_CHAIN));assert.ok(back.every((v,c)=>Math.abs(v-z[c])<1e-3),`latent round trip ${z} -> ${back}`);}
assert.deepEqual(multiaxial([.4,.4,.4]),[.4,.4,.4]);const red=multiaxial([1,0,0]);assert.ok(red[0]<1&&red[1]>0);assert.deepEqual(ycbcrOperation([1,1,1]),[1,1,1]);const bright=ycbcrOperation([1,.9,.3]);assert.ok(bright[2]>.3&&bright[0]<=1);
const identity=bakeLut({},17),out=new Float64Array(3);validateLut(identity,17);sampleLut(identity,17,.12,.45,.89,out);assert.ok(out.every((v,i)=>Math.abs(v-[.12,.45,.89][i])<1e-14));
for(const [r,g,b] of [[0,0,0],[1,1,1],[1,0,.5],[-1,2,.3]]){sampleLut(identity,17,r,g,b,out);assert.ok(out.every((v,i)=>Math.abs(v-Math.max(0,Math.min(1,[r,g,b][i])))<1e-14));}
const invalid=identity.slice();invalid[0]=NaN;assert.throws(()=>validateLut(invalid,17));assert.throws(()=>validateLut(identity,33));
const metadata={cdesc:'RGBG',color_data:{cam_mul:[2,1,1.5,Infinity],pre_mul:[3,.5,2,0]}};
assert.deepEqual(whiteBalanceOptions(metadata,rawDefaults),{useCameraWb:true,useAutoWb:false,wb_fallback_daylight:false});
assert.deepEqual(whiteBalanceOptions(metadata,{...rawDefaults,wb:'custom'}).userMul,[2,1,1.5,1]);
const missing={...metadata,color_data:{...metadata.color_data,cam_mul:[0,1,0,0]}};
assert.deepEqual(whiteBalanceOptions(missing,rawDefaults),{useCameraWb:false,useAutoWb:false,userMul:[6,1,4,1],wb_fallback_daylight:true});
assert.deepEqual(whiteBalanceOptions({}, {...rawDefaults,wb:'auto'}),{useCameraWb:false,useAutoWb:true,wb_fallback_daylight:false});
assert.throws(()=>whiteBalanceOptions({},rawDefaults));assert.throws(()=>whiteBalanceOptions({...metadata,cdesc:'CYGM'},{...rawDefaults,wb:'custom'}));
for(const dimensions of [[0,2],[-1,2],[NaN,2],[120001,1000],[2],[3.2,4]])assert.throws(()=>validateDimensions(...dimensions));validateDimensions(6112,4064,6020,4024);
console.log('RAW core: DNG sniff, strict settings, crop/rotation, transfer/LUT, WB fallbacks and sensor bounds PASS');
