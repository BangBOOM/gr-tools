import test from "node:test";
import assert from "node:assert/strict";
import { TaskProgress } from "../src/progress.ts";

test("build progress measures completed checks and never finishes before artifact verification", () => {
  const progress = new TaskProgress("build", true, 0);
  assert.match(progress.view(2000).timing, /Estimating/);
  progress.update({phase:"verify-container"});
  progress.update({phase:"native-arm",probe:"four49_curve65_arm",status:"RUNNING"}, 3000);
  const running = progress.percent;
  progress.update({phase:"native-arm",probe:"four49_curve65_arm",status:"PASS"}, 6000);
  assert.ok(progress.percent > running);
  assert.match(progress.view(6000).timing, /About .* left/);
  assert.equal(progress.view(6000).checks, "1/13 checks complete");
  const completed = progress.percent;
  progress.update({phase:"native-arm",probe:"four49_curve65_arm",status:"PASS"});
  progress.update({phase:"decode-rust"});
  assert.equal(progress.percent, completed);
  progress.update({phase:"verify-result"});
  assert.equal(progress.percent, 99);
  progress.finish(true, 10000);
  assert.equal(progress.percent, 100);
  assert.match(progress.label, /Ready to download/);
  assert.equal(progress.view(20000).timing, "10s elapsed");
});

test("failure and cancellation freeze elapsed time below 100%", () => {
  const progress = new TaskProgress("build", false, 0, 45);
  progress.update({phase:"verify-container"});
  assert.match(progress.view(5000).timing, /About 40s left/);
  assert.match(progress.view(50000).timing, /Taking longer than estimated/);
  progress.finish(false, 8000);
  progress.update({phase:"verify-result"});
  progress.finish(true, 10000);
  assert.equal(progress.percent, 20);
  assert.equal(progress.view(20000).timing, "8s elapsed");
});

test("fit progress tracks completed styles and waits for final validation", () => {
  const progress = new TaskProgress("fit", true, 0);
  progress.update({phase:"fit-cube",completed:0,total:2,status:"RUNNING"});
  assert.equal(progress.label, "Fitting style 1 of 2");
  progress.update({phase:"fit-cube",completed:1,total:2,status:"PASS"});
  assert.equal(progress.percent, 50);
  progress.update({phase:"fit-cube",completed:2,total:2,status:"PASS"});
  assert.equal(progress.percent, 95);
  progress.finish(true, 5000);
  assert.equal(progress.percent, 100);
});

test("build checklist follows actual milestones and waits for all ARM suites and final artifact", () => {
  const p=new TaskProgress("build",true,0);
  const status=(id:string)=>p.steps().find(s=>s.id===id)!.status;
  assert.equal(status("plan"),"running");
  p.update({phase:"ready"});assert.equal(status("plan"),"running");
  p.update({phase:"prepare-style"});assert.equal(status("plan"),"running");
  p.update({phase:"check-plan"});assert.equal(status("plan"),"running");
  p.update({phase:"plan-checked"});assert.equal(status("plan"),"complete");
  p.update({phase:"decode-rust"});assert.equal(status("source"),"running");
  p.update({phase:"repack-rust"});assert.equal(status("source"),"complete");
  p.update({phase:"decode-independent"});assert.equal(status("container"),"running");
  p.update({phase:"native-arm",probe:"V9_menu_arm",status:"RUNNING"});assert.equal(status("container"),"complete");
  p.update({phase:"native-arm",probe:"V9_menu_arm",status:"PASS"});assert.equal(status("camera"),"running");
  p.update({phase:"native-arm",probe:"V9_menu_arm",status:"PASS"});assert.equal(p.steps().find(s=>s.id==="camera")!.detail,"1/13 suites");
  for(const probe of ["four49_curve65_arm","V9_text_guest","V9_icon_arm","V9_storage_guest","V9_backend_arm","V9_raw_arm","V9_ui_detail_arm","V9_1_capacity_arm","V9_1_memory_arm","V9_1_shared_pages_arm","persistence_apdata13_probe","persistence_refresh_property_gate"])p.update({phase:"native-arm",probe,status:"PASS"});
  assert.equal(status("camera"),"complete");
  p.update({phase:"native-arm",probe:"candidate-native-curves",status:"RUNNING"});assert.equal(status("curves"),"running");
  p.update({phase:"native-arm",probe:"candidate-native-curves",status:"PASS"});assert.equal(status("curves"),"complete");
  p.update({phase:"verify-result"});assert.equal(status("artifact"),"running");assert.equal(p.percent,99);
  p.finish(true,10000);assert.ok(p.steps().every(s=>s.status==="complete"));
});

test("stopped checklist retains completed evidence without checking unfinished or unrun steps", () => {
  const p=new TaskProgress("build",false,0);
  p.update({phase:"plan-checked"});p.update({phase:"decode-rust"});p.finish(false,4000);
  assert.ok(!p.steps().some(s=>s.id==="curves"));
  assert.equal(p.steps()[0].status,"complete");assert.equal(p.steps()[1].status,"stopped");
  assert.ok(p.steps().slice(2).every(s=>s.status==="pending"&&s.detail==="Not run"));
  p.update({phase:"verify-result"});assert.equal(p.steps()[1].status,"stopped");
  assert.deepEqual(new TaskProgress("fit",true,0).steps(),[]);
});
