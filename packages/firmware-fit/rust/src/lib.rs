//! Deterministic matrix/monotone-curve approximation of an exact serialized cube.
//! The caller evaluates the resulting recipe on an independent sample set.
use wasm_bindgen::prelude::*;
mod native_gamma;
const N: usize = 257;
fn clip(x: f64) -> f64 { x.clamp(0.0, 1.0) }
fn interp(x: f64, xs: &[f64], ys: &[f64]) -> f64 {
    if x <= xs[0] { return ys[0]; }
    let n = xs.len()-1; if x >= xs[n] { return ys[n]; }
    let (mut lo,mut hi)=(0,n);
    while hi-lo>1 {let mid=(lo+hi)/2;if xs[mid]<=x {lo=mid;}else{hi=mid;}}
    ys[lo]+(x-xs[lo])*((ys[hi]-ys[lo])/(xs[hi]-xs[lo]))
}
fn grid(x:f64,ys:&[f64])->f64 {let z=clip(x)*(ys.len()-1) as f64;let i=(z as usize).min(ys.len()-2);ys[i]+(z-i as f64)*(ys[i+1]-ys[i])}
struct Random(u32);
impl Random {fn next(&mut self)->f64 {let mut x=self.0;x^=x<<13;x^=x>>17;x^=x<<5;self.0=x;(x as f64+0.5)/4294967296.0}}
fn training()->Vec<[f64;3]> {let mut out=Vec::with_capacity(3034);for r in 0..9 {for g in 0..9 {for b in 0..9 {out.push([r as f64/8.0,g as f64/8.0,b as f64/8.0]);}}}let mut rng=Random(925210);for _ in 0..2048 {out.push([rng.next(),rng.next(),rng.next()]);}for i in 0..257 {out.push([i as f64/256.0;3]);}out}
fn isotonic(y:&[f64],weight:&[f64])->Vec<f64> {
    let mut blocks:Vec<(usize,usize,f64,f64)>=Vec::new();
    for i in 0..y.len(){blocks.push((i,i+1,y[i],weight[i]));while blocks.len()>1&&blocks[blocks.len()-2].2>blocks[blocks.len()-1].2 {let right=blocks.pop().unwrap();let left=blocks.pop().unwrap();let w=left.3+right.3;blocks.push((left.0,right.1,(left.2*left.3+right.2*right.3)/w,w));}}
    let mut out=vec![0.0;y.len()];for (first,last,value,_) in blocks {out[first..last].fill(value);}out
}
fn fit_curve(z:&[f64],target:&[f64],nodes:usize)->Vec<f64> {
    let mut count=[0.0;96];let mut sx=[0.0;96];let mut sy=[0.0;96];
    for (v,t) in z.iter().zip(target) {let bin=((v*96.0) as usize).min(95);count[bin]+=1.0;sx[bin]+=v;sy[bin]+=t;}
    let (mut x,mut y,mut w)=(Vec::new(),Vec::new(),Vec::new());for i in 0..96 {if count[i]>0.0{x.push(sx[i]/count[i]);y.push(sy[i]/count[i]);w.push(count[i]);}}
    let values=isotonic(&y,&w);let (mut xx,mut yy)=(vec![0.0],vec![0.0]);for (a,b) in x.iter().zip(values){if *a>1e-10 {xx.push(*a);yy.push(b);}}
    let mut out=vec![0.0;nodes];for i in 1..nodes {out[i]=clip(interp(i as f64/(nodes-1) as f64,&xx,&yy)).max(out[i-1]).min(out[i-1]+4.0/(nodes-1) as f64);}out
}
fn quant_curve(curve:&[f64])->Vec<f64> {curve.iter().map(|x|(x*16384.0+0.5).floor()).collect()}
/// The 3034 developed-photo training colors: a 9³ lattice, 2048 xorshift32 colors and 257 grays.
#[wasm_bindgen]
pub fn training_points()->Vec<f64> {training().iter().flat_map(|v|v.iter().copied()).collect()}
/// MultiAxial on the signed matrix output: `z += h(4095·(max−min))/2048 · (R0·z − z)` (report CL §3). `ma` = R0 row-major (9), knots (3), values (3), slopes (3), divisor.
fn multiaxial(z:[f64;3],ma:&[f64])->[f64;3] {
    let x=(4095.0*(z[0].max(z[1]).max(z[2])-z[0].min(z[1]).min(z[2]))).floor().clamp(0.0,4095.0);
    let k=if x>=ma[11] {2} else if x>=ma[10] {1} else {0};let w=(ma[12+k]+ma[15+k]*(x-ma[9+k])/ma[18])/2048.0;
    [0,1,2].map(|c|{let r=(ma[c*3]*z[0]+ma[c*3+1]*z[1])+ma[c*3+2]*z[2];z[c]+w*(r-z[c])})
}
/// The matrix rows and MultiAxial on every training latent.
fn stage(rows:&[[f64;3];3],latent:&[[f64;3]],ma:&[f64])->Vec<[f64;3]> {
    latent.iter().map(|v|multiaxial([0,1,2].map(|c|(v[0]*rows[c][0]+v[1]*rows[c][1])+v[2]*rows[c][2]),ma)).collect()
}
/// Channel `c`: gamma on the clipped MultiAxial output, the weighted isotonic curve against the target, and the quantized error.
fn channel(c:usize,staged:&[[f64;3]],target:&[f64],gamma:&[f64],nodes:usize)->(f64,Vec<f64>,Vec<f64>) {
    let z:Vec<f64>=staged.iter().map(|v|grid(v[c],gamma)).collect();
    let float_curve=fit_curve(&z,target,nodes);let q=quant_curve(&float_curve);let scaled:Vec<f64>=q.iter().map(|v|v/16384.0).collect();
    let error=z.iter().zip(target).map(|(v,t)|(grid(*v,&scaled)-t).powi(2)).sum::<f64>()/z.len() as f64;
    (error,q,float_curve)
}
/// Returns 9 float matrix + 3*nodes float curves + 9 Q13 + 3*nodes Q14, row-major.
#[wasm_bindgen]
/// `latent`: the training colors as Standard matrix outputs mapped by `Bstd⁻¹` (3034×3, the host inverts the developed photo);
/// `target`: the cube's values at the training colors with YCbCrOperation inverted (3034×3); `ma`: the MultiAxial constants (19).
pub fn fit_cube(latent:&[f64],target:&[f64],nodes:usize,gamma:&[f64],ma:&[f64],seed_matrices:&[f64])->Result<Vec<f64>,JsValue> {
    if ![65,257].contains(&nodes)||latent.len()!=3034*3||target.len()!=3034*3||latent.iter().chain(target).any(|v|!v.is_finite())||gamma.len()!=N||ma.len()!=19||ma[18]<=0.0||seed_matrices.len()%9!=0||seed_matrices.is_empty() {return Err(JsValue::from_str("Invalid fitting inputs"));}
    let latent:Vec<[f64;3]>=latent.chunks_exact(3).map(|v|[v[0],v[1],v[2]]).collect();let targets:Vec<Vec<f64>>=(0..3).map(|c|target.iter().skip(c).step_by(3).copied().collect()).collect();
    let total=|rows:&[[f64;3];3]|{let s=stage(rows,&latent,ma);(0..3).map(|c|channel(c,&s,&targets[c],gamma,nodes).0).sum::<f64>()};
    let mut rows=[[0.0;3];3];let mut best=f64::INFINITY;
    for seed in seed_matrices.chunks_exact(9) {let trial=[0,1,2].map(|c|[seed[c*3]/8192.0,seed[c*3+1]/8192.0,seed[c*3+2]/8192.0]);let error=total(&trial);if error<best {best=error;rows=trial;}}
    // Coordinate search on each row with the other rows fixed; MultiAxial couples the rows, so the channel error is re-evaluated on the full stage. Two passes.
    for _ in 0..2 {for c in 0..3 {
        let mut row_best=channel(c,&stage(&rows,&latent,ma),&targets[c],gamma,nodes).0;
        for step in [0.15,0.065,0.025,0.008] {for _ in 0..2 {let mut changed=false;for coefficient in 0..3 {if coefficient==c {continue;}for direction in [-1.0,1.0] {let mut trial=rows;trial[c][coefficient]+=direction*step;trial[c][c]-=direction*step;if trial[c].iter().any(|v|*v< -1.25||*v>2.5)||trial[c][c]<0.1 {continue;}let error=channel(c,&stage(&trial,&latent,ma),&targets[c],gamma,nodes).0;if error+1e-10<row_best {row_best=error;rows=trial;changed=true;}}}if !changed {break;}}}
    }}
    let staged=stage(&rows,&latent,ma);let mut float_matrix=vec![0.0;9];let mut float_curves=vec![0.0;3*nodes];let mut mq=vec![0.0;9];let mut q=[[0.0;3];3];
    for c in 0..3 {
        float_matrix[c*3..c*3+3].copy_from_slice(&rows[c]);float_curves[c*nodes..(c+1)*nodes].copy_from_slice(&channel(c,&staged,&targets[c],gamma,nodes).2);
        q[c]=rows[c].map(|v|(v*8192.0+0.5).floor());q[c][c]=8192.0-(0..3).filter(|j|*j!=c).map(|j|q[c][j]).sum::<f64>();
        if q[c].iter().any(|v|*v< -32768.0||*v>32767.0) {return Err(JsValue::from_str("Fitted matrix exceeds int16 Q13"));}
        mq[c*3..c*3+3].copy_from_slice(&q[c]);
    }
    let quant_rows=[0,1,2].map(|c|q[c].map(|v|v/8192.0));let staged=stage(&quant_rows,&latent,ma);let mut fq=vec![0.0;3*nodes];
    for c in 0..3 {fq[c*nodes..(c+1)*nodes].copy_from_slice(&channel(c,&staged,&targets[c],gamma,nodes).1);}
    let mut result=float_matrix;result.extend(float_curves);result.extend(mq);result.extend(fq);Ok(result)
}
#[cfg(test)]
mod tests {use super::*;
    #[test]fn pava_merges_descending(){assert_eq!(isotonic(&[0.2,0.8,0.4,1.0],&[1.0;4]),vec![0.2,0.6000000000000001,0.6000000000000001,1.0]);}
    #[test]fn fitted_curve_is_bounded(){let z:Vec<f64>=(0..200).map(|i|i as f64/199.0).collect();let target:Vec<f64>=z.iter().map(|v|1.0-v).collect();let q=quant_curve(&fit_curve(&z,&target,257));assert_eq!(q[0],0.0);assert!(q.windows(2).all(|v|v[1]>=v[0]&&v[1]-v[0]<=256.0));assert!(q.iter().all(|v|*v>=0.0&&*v<=16384.0));}
    #[test]fn training_size(){assert_eq!(training().len(),3034);}
    #[test]fn multiaxial_identity_on_grays(){let ma=[420.0/1024.0,76.0/1024.0,16.0/1024.0,38.0/1024.0,458.0/1024.0,16.0/1024.0,38.0/1024.0,76.0/1024.0,398.0/1024.0,0.0,640.0,1280.0,0.0,21.0,62.0,1.0,2.0,7.0,32.0];assert_eq!(multiaxial([0.4,0.4,0.4],&ma),[0.4,0.4,0.4]);let z=multiaxial([1.0,0.0,0.0],&ma);assert!(z[0]<1.0&&z[1]>0.0);}
}
