/* R-fastest trilinear sampling. RAW stays float32 through the LUT;
   only the returned display canvas is quantized to 8-bit. */
const photos = new Map();
function render(pixels, lut, size) {
  const floating=pixels instanceof Float32Array, stride=floating?3:4;
  const result=new Uint8ClampedArray(pixels.length/stride*4);
  const strideG=size*3,strideB=size*size*3;
  for(let p=0,q=0;p<pixels.length;p+=stride,q+=4){
    const r=Math.max(0,Math.min(1,floating?pixels[p]:pixels[p]/255))*(size-1);
    const g=Math.max(0,Math.min(1,floating?pixels[p+1]:pixels[p+1]/255))*(size-1);
    const b=Math.max(0,Math.min(1,floating?pixels[p+2]:pixels[p+2]/255))*(size-1);
    const lr=Math.floor(r),lg=Math.floor(g),lb=Math.floor(b);
    const hr=Math.min(lr+1,size-1),hg=Math.min(lg+1,size-1),hb=Math.min(lb+1,size-1);
    const fr=r-lr,fg=g-lg,fb=b-lb;
    let rr=0,gg=0,bb=0;
    for(let bz=0;bz<2;bz++)for(let gy=0;gy<2;gy++){
      const weight=(bz?fb:1-fb)*(gy?fg:1-fg);
      const index=(bz?hb:lb)*strideB+(gy?hg:lg)*strideG,a=index+lr*3,c=index+hr*3;
      rr+=weight*(lut[a]*(1-fr)+lut[c]*fr);
      gg+=weight*(lut[a+1]*(1-fr)+lut[c+1]*fr);
      bb+=weight*(lut[a+2]*(1-fr)+lut[c+2]*fr);
    }
    result[q]=Math.round(rr*255);result[q+1]=Math.round(gg*255);result[q+2]=Math.round(bb*255);result[q+3]=floating?255:pixels[p+3];
  }
  return result;
}
self.onmessage=({data})=>{
  if(data.type==='load'){photos.set(data.id,data.format==='rgb-f32'?new Float32Array(data.pixels):new Uint8ClampedArray(data.pixels));return;}
  if(data.type==='remove'){photos.delete(data.id);return;}
  if(data.type==='render')try{
    const original=data.pixels?new Uint8ClampedArray(data.pixels):photos.get(data.photoId);
    if(!original)throw new Error('Photo not loaded');
    const pixels=render(original,new Float32Array(data.lut),data.size);
    self.postMessage({...data,lut:undefined,pixels:pixels.buffer},[pixels.buffer]);
  }catch(e){self.postMessage({type:'error',requestId:data.requestId,error:e.message});}
};
