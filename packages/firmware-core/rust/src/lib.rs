//! GR III framed LZSS. No filesystem, network, research imports or runtime Python.
use std::collections::{HashMap, VecDeque};
use wasm_bindgen::prelude::*;

pub const MAX_INPUT: usize = 32 * 1024 * 1024;
pub const PAYLOAD_BYTES: usize = 59_718_388;
const SYNC: &[u8] = &[0x4c, 2, 0x4c, 2, 0xa5, 0x5a, 0x5a, 0xa5];
#[derive(Debug, Clone)]
pub struct Frame { pub raw_start: usize, pub raw_end: usize, pub out_start: usize, pub out_end: usize }
fn err(s: &str) -> String { s.into() }
fn u16be(b: &[u8], p: usize) -> Result<usize, String> {
    let a = b.get(p..p+2).ok_or_else(|| err("truncated u16"))?;
    Ok(u16::from_be_bytes([a[0], a[1]]) as usize)
}
pub fn sum(b: &[u8]) -> Result<u32, String> {
    if b.len()%4 != 0 { return Err(err("unaligned checksum")); }
    Ok(b.chunks_exact(4).fold(0u32, |s, w| s.wrapping_add(u32::from_le_bytes(w.try_into().unwrap()))))
}
pub fn unpack(b: &[u8]) -> Result<(Vec<u8>, Vec<Frame>, usize), String> {
    if b.len() < 0x80 || b.len() > MAX_INPUT { return Err(err("container size bound")); }
    let mut out = Vec::with_capacity(PAYLOAD_BYTES);
    let mut frames = Vec::new(); let mut p = 0x80;
    loop {
        let begin=p; let prefix=u16be(b,p)?; p+=2;
        if prefix==0 { return Ok((out,frames,begin)); }
        if frames.len()>=4096 { return Err(err("too many frames")); }
        let end=p.checked_add(prefix&0x7fff).ok_or_else(||err("frame overflow"))?;
        if end>b.len() {return Err(err("frame exceeds input"));}
        let os=out.len();
        if prefix&0x8000!=0 {
            if out.len()+end-p>PAYLOAD_BYTES {return Err(err("decoded size bound"));}
            out.extend_from_slice(&b[p..end]);p=end;
        } else {
            let mut terminated=false;
            while p<end && !terminated {
                if p+2>end {return Err(err("short flags"));}
                let flags=u16be(b,p)?;p+=2;
                for bit in (0..16).rev() {
                    if p>=end {break;}
                    if flags&(1<<bit)==0 {
                        if out.len()>=PAYLOAD_BYTES {return Err(err("decoded size bound"));}
                        out.push(b[p]);p+=1;
                    } else {
                        if p+2>end {return Err(err("short reference"));}
                        let a=b[p] as usize;let c=b[p+1] as usize;p+=2;
                        let distance=((a&0xf8)<<5)|c;let mut count=a&7;
                        if count==7 {loop {if p>=end{return Err(err("short length extension"));}let x=b[p] as usize;p+=1;count+=x;if x!=255{break;}}}
                        if distance==0 {terminated=true;if p!=end{return Err(err("trailing compressed data"));}break;}
                        if distance>out.len() || distance>8191 {return Err(err("invalid back reference"));}
                        let n=count+3;if out.len()+n>PAYLOAD_BYTES{return Err(err("decoded size bound"));}
                        for _ in 0..n {out.push(out[out.len()-distance]);}
                    }
                }
            }
            if !terminated{return Err(err("missing frame terminator"));}
        }
        frames.push(Frame{raw_start:begin,raw_end:end,out_start:os,out_end:out.len()});
    }
}
pub fn inspect_container(b: &[u8]) -> Result<(Vec<u8>, Vec<Frame>),String> {
    if b.get(..8)!=Some(b"RICOH\0\0\0") || b.get(8..16)!=Some(b"GR III\0\0") || b.get(0x38..0x3a)!=Some(&[2,10]) || b.get(0x78..0x80)!=Some(SYNC) {return Err(err("unsupported GR III v2.10 header"));}
    let (out,frames,zero)=unpack(b)?;let aligned=(zero+5)&!3;
    if out.len()!=PAYLOAD_BYTES || b.len()!=aligned+24 || b.get(aligned..aligned+8)!=Some(SYNC) || b[zero+2..aligned].iter().any(|x|*x!=0) {return Err(err("invalid footer layout"));}
    let word=|p:usize|u32::from_le_bytes(b[p..p+4].try_into().unwrap()) as usize;
    if word(aligned+8)!=2 || word(aligned+12)!=zero+2-0x80 || word(aligned+16)!=out.len() || sum(b)?!=0 || sum(&out)?!=0 {return Err(err("invalid footer fields or additive checksum"));}
    Ok((out,frames))
}
#[derive(Default)]
struct Window { chains: HashMap<u32, VecDeque<usize>>, expiry: VecDeque<(usize,u32)> }
fn key(b:&[u8],p:usize)->u32 {b[p] as u32|((b[p+1] as u32)<<8)|((b[p+2] as u32)<<16)}
impl Window {
    fn remember(&mut self,b:&[u8],p:usize) {
        while self.expiry.front().is_some_and(|(old,_)|old.saturating_add(8191)<p) {
            let (old,k)=self.expiry.pop_front().unwrap();
            if let Some(c)=self.chains.get_mut(&k) {if c.front()==Some(&old){c.pop_front();}if c.is_empty(){self.chains.remove(&k);}}
        }
        if p+2<b.len(){let k=key(b,p);let c=self.chains.entry(k).or_default();if c.len()==16{c.pop_front();}c.push_back(p);self.expiry.push_back((p,k));}
    }
    fn find(&self,b:&[u8],p:usize,remaining:usize)->(usize,usize) {
        if p+3>b.len(){return(0,0);}
        let Some(c)=self.chains.get(&key(b,p)) else{return(0,0)};
        let mut best=(0,0);let limit=remaining.min(b.len()-p);
        for &old in c.iter().rev() {let d=p-old;if d>8191{break;}if d==0{continue;}
            let mut n=0;while n<limit && b[p+n]==b[old+n]{n+=1;}
            if n>=3 && n>best.0 {best=(n,d);if n==limit{break;}}
        }best
    }
}
fn literal(b:&[u8],start:usize,take:usize)->(Vec<u8>,usize){let n=take.min(0x7fff).min(b.len()-start);let mut a=((n|0x8000)as u16).to_be_bytes().to_vec();a.extend_from_slice(&b[start..start+n]);(a,n)}
fn compress(b:&[u8],start:usize,limit:usize,w:&mut Window)->(Vec<u8>,usize) {
    let end=start+limit;let mut body=Vec::new();let mut p=start;let mut terminated=false;
    while !terminated {let mut flags=0u16;let mut group=Vec::new();
        for bit in (0..16).rev() {
            if p==end {flags|=1<<bit;group.extend_from_slice(&[0,0]);terminated=true;break;}
            let(n,d)=w.find(b,p,end-p);let mut token=Vec::new();
            if n!=0 {let v=n-3;token.push((((d>>5)&0xf8)|v.min(7))as u8);token.push((d&255)as u8);if v>=7 {let mut extra=v-7;while extra>=255{token.push(255);extra-=255;}token.push(extra as u8);}}
            else {token.push(b[p]);}
            if 2+body.len()+2+group.len()+token.len()>0x7fff {break;}
            if n!=0 {flags|=1<<bit;}
            group.extend_from_slice(&token);for _ in 0..n.max(1){w.remember(b,p);p+=1;}
        }
        if group.is_empty(){break;}
        if body.len()+2+group.len()>0x7fff{break;}
        body.extend_from_slice(&flags.to_be_bytes());body.extend_from_slice(&group);
    }
    let consumed=p-start;if !terminated || body.is_empty(){return literal(b,start,limit);}
    let mut encoded=(body.len()as u16).to_be_bytes().to_vec();encoded.extend_from_slice(&body);
    if consumed<=0x7fff && encoded.len()>=2+consumed {literal(b,start,consumed)}else{(encoded,consumed)}
}
pub fn repack_container(template:&[u8],payload:&[u8])->Result<Vec<u8>,String>{
    let(original,frames)=inspect_container(template)?;
    if payload.len()!=original.len(){return Err(err("decoded length changes prohibited"));}
    let mut body=payload.to_vec();let n=body.len();let check=sum(&body[..n-4])?.wrapping_neg();body[n-4..].copy_from_slice(&check.to_le_bytes());
    let mut raw=template[..0x80].to_vec();
    for f in &frames {let history=f.out_start.saturating_sub(8191);
        if original[history..f.out_end]==body[history..f.out_end]{raw.extend_from_slice(&template[f.raw_start..f.raw_end]);continue;}
        let mut w=Window::default();for p in history..f.out_start {w.remember(&body,p);}
        let(encoded,n)=compress(&body,f.out_start,f.out_end-f.out_start,&mut w);
        if n!=f.out_end-f.out_start{return Err(err("changed frame cannot preserve schedule"));}raw.extend_from_slice(&encoded);
    }
    raw.extend_from_slice(&[0,0]);let stream=raw.len()-0x80;while raw.len()%4!=0{raw.push(0);}raw.extend_from_slice(SYNC);
    for x in [2u32,stream as u32,body.len()as u32]{raw.extend_from_slice(&x.to_le_bytes());}
    let check=sum(&raw)?.wrapping_neg();raw.extend_from_slice(&check.to_le_bytes());
    let(out,new_frames)=inspect_container(&raw)?;
    if out!=body || new_frames.iter().map(|f|f.out_end-f.out_start).ne(frames.iter().map(|f|f.out_end-f.out_start)){return Err(err("repack verification failed"));}Ok(raw)
}
#[wasm_bindgen]
pub fn decode(raw:&[u8])->Result<Vec<u8>,JsValue>{inspect_container(raw).map(|x|x.0).map_err(|e|JsValue::from_str(&e))}
#[wasm_bindgen]
pub fn repack(template:&[u8],payload:&[u8])->Result<Vec<u8>,JsValue>{repack_container(template,payload).map_err(|e|JsValue::from_str(&e))}
#[wasm_bindgen]
pub fn checksum(bytes:&[u8])->Result<u32,JsValue>{sum(bytes).map_err(|e|JsValue::from_str(&e))}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]fn malformed(){assert!(unpack(&[]).is_err());let mut b=vec![0;128];b.extend_from_slice(&[0,4,0x80,0,8,1]);assert!(unpack(&b).is_err());}
    #[test]fn overlap(){let mut b=vec![0;128];b.extend_from_slice(&[0,8,0x30,0,b'A',b'B',0,2,0,0,0,0]);assert_eq!(unpack(&b).unwrap().0,b"ABABA");}
    #[test]#[ignore = "requires user's local official BIN; run explicitly"]fn fixture_roundtrip(){let root=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");let raw=std::fs::read(root.join("fwdc239b.bin")).expect("official fixture missing");let(payload,_)=inspect_container(&raw).unwrap();assert_eq!(repack_container(&raw,&payload).unwrap(),raw);}
}
