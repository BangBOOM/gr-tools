/** A pending hardware record is distinct from offline evidence. */
export function cameraChecklist(report:Record<string,unknown>,photos:Array<{name:string;sha256:string}>=[]):string {
  if(typeof report.candidateSha256!=='string'||typeof report.reportSha256!=='string'||!/^[a-f0-9]{64}$/.test(report.candidateSha256)||!/^[a-f0-9]{64}$/.test(report.reportSha256))throw new Error('A hash-bound build report is required');
  const safe=(s:string)=>s.replace(/[|\r\n<>]/g,' ');
  return `# GR III HDF Camera Acceptance Record

Status: REQUIRES_DEVICE_TEST. Offline checks do not replace this record. Reference firmware results do not qualify this candidate.

- Firmware SHA256: \`${report.candidateSha256}\`
- Build report SHA256: \`${report.reportSha256}\`
- Camera: GR III HDF / official 2.10 platform
- Operator, camera serial identifier, date: Pending
- Baseline: three isolated Custom slots; all nine controls at 0; record every changed value

## DNG and Settings Binding

| File | SHA256 | Settings and expectations |
| --- | --- | --- |
${photos.length?photos.map(p=>`| ${safe(p.name)} | ${p.sha256} | Pending |`).join('\n'):'| Select a local DNG and record its hash | Unbound; acceptance cannot be completed | Pending |'}

## Required Paths

| Scenario | Actions / coverage | Result / file / notes |
| --- | --- | --- |
| Update | Verify the SD root file hash and the version after updating | NOT RUN |
| Startup | Cold start, warm start, startup after battery removal | NOT RUN |
| Menu and ADJ | Switch between all four styles and factory styles; verify slot IDs, selected style names, and order | NOT RUN |
| RAW pages | Nine page categories × both Original states | NOT RUN |
| Controls | Four styles × three Custom slots × nine controls at −4 / 0 / +4; verify isolation | NOT RUN |
| Save and restore | Save, restart, U mode, old-registry default fallback | NOT RUN |
| RAW transactions | Cancel and confirm; alternate factory/custom styles and different DNGs | NOT RUN |
| Icons | Text, border color, transparent background, orientation, selection state | NOT RUN |
| Continuous use | Repeated development, rapid switching, temperature and stability | NOT RUN |
| Color | Bind each original DNG, camera JPEG, setting, expectation, and observation | NOT RUN |

Replacing a fixed slot changes how historical DNGs interpret that slot's recipe. Registry changes cause old parameter records to fall back to defaults. Record real ISP, scheduling, stack, and storage issues; offline ARM emulation does not replace these tests.
`;
}
