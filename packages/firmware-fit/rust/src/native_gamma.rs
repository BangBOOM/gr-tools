//! Integer scalar transcription of isolated native gamma, version v1.
use wasm_bindgen::prelude::*;
fn mix(a:i64,b:i64,w:i64)->i64 {(w*a+(512-w)*b+256)>>9}
#[wasm_bindgen]
pub fn native_gamma(key:i32,contrast:i32,highlight:i32,shadow:i32,flag:u32,exposure:u32,seeds:&[u32],families:&[u16],blend:&[u16],constant:u16)->Result<Vec<u16>,JsValue>{
    if [key,contrast,highlight,shadow].iter().any(|v|*v< -4||*v>4)||flag>1||exposure==0||exposure>65535||seeds.len()!=9||families.len()!=3*5*257||blend.len()!=97||constant<64{return Err(JsValue::from_str("Invalid native gamma inputs"));}
    let seed=seeds[(key+4) as usize] as i64;let pivot=((seed*(if flag==0 {2}else{1})*exposure as i64)>>13).clamp(128,2048);
    let lo=if pivot<256 {0}else if pivot<512 {1}else if pivot<1024 {2}else{3};let hi=lo+1;let anchor=if pivot==2048 {128}else{pivot as usize/16};
    let at=|g:usize,a:usize,i:usize|families[(g*5+a)*257+i] as i64;
    let mut shapes=Vec::new();
    for adjustment in [highlight,0,-shadow]{let t=2*contrast+adjustment;let (g0,g1,w)=if t>12 {(0,1,512)}else if t>0 {(0,1,t as i64*512/12)}else if t>=-12 {(1,2,(t as i64+12)*512/12)}else{(1,2,0)};
        let av=mix(at(g0,lo,anchor),at(g1,lo,anchor),w);let bv=mix(at(g0,hi,anchor),at(g1,hi,anchor),w);let target=(118*constant as i64)&65535;
        let cross=if av>bv {if bv>=target {0}else{((target-bv)<<9)/(av-bv)}}else{512};
        shapes.push((0..256).map(|i|mix(mix(at(g0,lo,i),at(g1,lo,i),w),mix(at(g0,hi,i),at(g1,hi,i),w),cross)).collect::<Vec<i64>>());
    }
    let denominator=0x3f02*(constant as i64>>6);let mut out=Vec::with_capacity(256);
    for i in 0..256 {let x=i as i64*16;let other=shapes[if pivot>=x {2}else{0}][i];let mut y=shapes[1][i];
        if pivot<x&&highlight!=0 {if x>=4*pivot {y=other;}else{let index=(i as i64*2*256/pivot-32).clamp(0,96) as usize;let w=blend[index] as i64;y=(w*other+(2048-w)*y+1024)>>11;}}
        if pivot>x&&shadow!=0 {if x<=pivot/4 {y=other;}else{let index=(pivot*32/x-32).clamp(0,96) as usize;let w=blend[index] as i64;y=(w*other+(2048-w)*y+1024)>>11;}}
        let q=((y<<14)/denominator).min(16384);if q<0 {return Err(JsValue::from_str("Native gamma outside Q14 bounds"));}out.push(q as u16);
    }Ok(out)
}
