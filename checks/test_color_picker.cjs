const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({});vm.runInContext(['editor-colors.js','color-picker.js'].map(name=>fs.readFileSync(path.join(__dirname,'../source',name),'utf8')).join('\n'),c);
const plain=value=>JSON.parse(JSON.stringify(value));
for(const [h,expected]of [[0,{r:255,g:0,b:0}],[60,{r:255,g:255,b:0}],[120,{r:0,g:255,b:0}],[180,{r:0,g:255,b:255}],[240,{r:0,g:0,b:255}],[300,{r:255,g:0,b:255}],[360,{r:255,g:0,b:0}]])assert.deepEqual(plain(c.hsvToRGB(h,1,1)),expected);
for(let i=0;i<200;i++){
 const source={r:(i*37)%256,g:(i*89)%256,b:(i*157)%256},hsv=c.rgbToHSV(source),restored=c.hsvToRGB(hsv.h,hsv.s,hsv.v);assert.deepEqual(plain(restored),source,'HSV roundtrip preserves RGB channels');
}
assert.equal(c.rgbToHSV({r:120,g:120,b:120},213).h,213,'Gray preserves the chosen hue');
assert.deepEqual(plain(c.colorPlanePosition(50,25,{left:0,top:0,width:100,height:100})),{s:.5,v:.75});
assert.deepEqual(plain(c.colorPlanePosition(-50,150,{left:0,top:0,width:100,height:100})),{s:0,v:0});
assert.equal(c.colorPickerValue('#00ff00',1,'#fff','hsl'),'hsl(120, 100%, 50%)');
assert.equal(c.colorPickerValue('#00ff00',.25,'#fff','hsl'),'hsla(120, 100%, 50%, 0.25)');
assert.equal(c.colorPickerValue('#ff0000',1,'#fff','rgb'),'rgb(255, 0, 0)');
assert.equal(c.colorPickerValue('#ff0000',.5,'rgba(0,0,0,.1)','hex'),'#ff000080');
let writes=0;c.writePickerValue=()=>writes++;vm.runInContext('colorContext={hsv:{h:200,s:.5,v:.5},alpha:1}',c);
const press=(key,shiftKey=false)=>{let prevented=false;c.colorPlaneKey({key,shiftKey,preventDefault(){prevented=true;}});return prevented;};
assert.equal(press('ArrowRight'),true);assert.equal(vm.runInContext('colorContext.hsv.s',c),.51);
press('ArrowUp',true);assert.equal(vm.runInContext('colorContext.hsv.v',c),.6);press('Home');assert.equal(vm.runInContext('colorContext.hsv.s',c),0);press('End');assert.equal(vm.runInContext('colorContext.hsv.s',c),1);
assert.equal(press('Enter'),false,'Enter retains normal Apply behavior');assert.equal(writes,4);
console.log('PASS: visual picker HSV/RGB conversion, gray hue memory, clamped pointers, HEX/RGB/HSL formats and keyboard control');
