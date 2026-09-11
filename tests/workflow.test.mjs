import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize, validFields} from '../lib/workflow.ts';
test('skipped stages do not reduce completed workflow progress',()=>{
 assert.deepEqual(summarize([{name:'Create',status:'COMPLETE',progress:100},{name:'Optional',status:'SKIPPED',progress:0}]),{progress:100,nextAction:'Workflow complete',status:'COMPLETE'});
});
test('waiting next stage remains waiting and skipped stages are excluded',()=>{
 assert.deepEqual(summarize([{name:'Create',status:'COMPLETE',progress:100},{name:'Optional',status:'SKIPPED',progress:0},{name:'Approval',status:'WAITING',progress:0}]),{progress:50,nextAction:'Approval',status:'WAITING'});
});
test('rounded 100 percent does not complete an unfinished stage',()=>{
 assert.equal(summarize([{name:'A',status:'COMPLETE',progress:100},{name:'B',status:'IN_PROGRESS',progress:99}]).status,'ACTIVE');
});
test('reject nested fields and prototype keys',()=>{
 assert.equal(validFields({notes:{bad:true}}),false);
 assert.equal(validFields(JSON.parse('{"__proto__":true}')),false);
 assert.equal(validFields({notes:'hello',approved:true,completion:80}),true);
});
