// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one script leaf's pages load (served as /assets/app.js, so the CSP needs no inline scripts).
 * Everything works without it except Turnstile; it adds copying, line links, local times,
 * the token field and the list of pastes made in this browser.
 */
export const APP_JS = String.raw`(function(){
"use strict";
var $=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return [].slice.call((r||document).querySelectorAll(s))};
var TK='leaf_token',MINE='leaf_pastes';
function store(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}}
function read(k){try{return localStorage.getItem(k)}catch(e){return null}}
function mine(){var a=[];try{a=JSON.parse(read(MINE)||'[]')}catch(e){}var now=Date.now();return a.filter(function(p){return p&&p.id&&(!p.expires||p.expires>now)})}
function saveMine(a){store(MINE,a.length?JSON.stringify(a.slice(0,50)):null)}
function when(d){return new Date(d).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
function copy(text,b,label){if(!navigator.clipboard)return;navigator.clipboard.writeText(text).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent=label},1600)},function(){})}

// local times
$$('time[datetime]').forEach(function(t){t.textContent=new Date(t.getAttribute('datetime')).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})});

// copy buttons: data-copy="text", or data-copy-code for the paste without its line numbers
function codeText(){return $$('#code .ln').map(function(l){var t='';l.childNodes.forEach(function(c){if(!(c.classList&&c.classList.contains('n')))t+=c.textContent});return t}).join('\n')}
$$('[data-copy],[data-copy-code]').forEach(function(b){var label=b.textContent;b.addEventListener('click',function(){copy(b.hasAttribute('data-copy-code')?codeText()+'\n':b.getAttribute('data-copy'),b,label)})});

// line links on paste pages
var code=$('#code');
if(code){
  var mark=function(){$$('.ln.on',code).forEach(function(l){l.classList.remove('on')});var m=/^#L(\d+)(?:-L?(\d+))?$/.exec(location.hash);if(!m)return;var a=+m[1],z=+(m[2]||m[1]);if(z<a){var t=a;a=z;z=t}for(var i=a;i<=z&&i<a+5000;i++){var e=document.getElementById('L'+i);if(e)e.classList.add('on')}var f=document.getElementById('L'+a);if(f&&!mark.done){f.scrollIntoView({block:'center'});mark.done=1}};
  var anchor=0;
  code.addEventListener('click',function(e){var n=e.target.closest&&e.target.closest('.n');if(!n)return;e.preventDefault();var i=+n.parentNode.id.slice(1);if(e.shiftKey&&anchor){history.replaceState(null,'','#L'+Math.min(anchor,i)+'-L'+Math.max(anchor,i))}else{anchor=i;history.replaceState(null,'','#L'+i)}mark()});
  addEventListener('hashchange',mark);mark();
  var wrap=$('#wrap');if(wrap)wrap.addEventListener('click',function(){code.classList.toggle('wrap');wrap.setAttribute('aria-pressed',code.classList.contains('wrap'))});
}

// a paste was just created: remember it in this browser (only for pastes made without a token)
var made=$('#made');
if(made){try{var p=JSON.parse(made.textContent);if(!p.owned){var a=mine().filter(function(x){return x.id!==p.id});a.unshift(p);saveMine(a)}}catch(e){}}

// a paste was deleted: forget it
var gone=$('[data-deleted]');
if(gone)saveMine(mine().filter(function(x){return x.id!==gone.getAttribute('data-deleted')}));

// new paste form
var form=$('#new');
if(!form)return;
var tok=read(TK)||'',ta=$('#content',form),exp=$('#expires',form),ts=$('#ts'),tf=$('#token-field'),tin=$('#token-input'),hid=$('#token',form);
var long=(form.getAttribute('data-long')||'').split(',').filter(Boolean);
function opts(on){$$('option[data-long]',exp).forEach(function(o){o.remove()});if(on)long.forEach(function(v){var o=document.createElement('option');o.value=v;o.textContent={'1d':'1 day','7d':'7 days','30d':'30 days','1y':'1 year','never':'Never'}[v]||v;o.setAttribute('data-long','');exp.appendChild(o)});if(on&&!exp.dataset.touched)exp.value='7d'}
function mode(){var on=!!tok;document.documentElement.classList.toggle('authed',on);hid.value=tok;opts(on);if(ts)ts.hidden=on;if(!on)renderTs();list()}
var tsDone=false;
function renderTs(){if(tsDone||!ts||!window.turnstile)return;tsDone=true;window.turnstile.render('#ts-box',{sitekey:ts.getAttribute('data-sitekey'),theme:'light',size:'flexible'})}
window.leafTurnstile=function(){if(!tok)renderTs()};
exp.addEventListener('change',function(){exp.dataset.touched=1});
ta.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();form.requestSubmit?form.requestSubmit():form.submit()}});
var cnt=$('#count'),max=+form.getAttribute('data-max-anon'),maxT=+form.getAttribute('data-max-token');
function count(){if(!cnt)return;var n=new Blob([ta.value]).size,lim=tok?maxT:max;cnt.textContent=(n<1024?n+' B':(n/1024).toFixed(1)+' KB')+' of '+Math.round(lim/1024)+' KB';cnt.classList.toggle('over',n>lim)}
ta.addEventListener('input',count);

// language detection while typing: the "auto" option shows what leaf will pick, a manual choice wins
var lang=$('#lang',form),autoOpt=lang&&$('option[value=auto]',lang),detT=0,detState=0,detQueue=false;
function runDetect(){if(!autoOpt||lang.value!=='auto')return;var t=ta.value;if(!t.trim()){autoOpt.textContent='Detect automatically';return}
  if(!window.leafDetect){detQueue=true;if(!detState){detState=1;var s=document.createElement('script');s.src='/assets/detect.js';s.async=true;s.onload=function(){detState=2;if(detQueue)runDetect()};s.onerror=function(){detState=0};document.head.appendChild(s)}return}
  detQueue=false;try{var r=window.leafDetect(t.slice(0,65536));autoOpt.textContent=r.id==='plaintext'?'Detect automatically (plain text so far)':'Detect automatically: '+r.label}catch(e){}}
function detectSoon(){clearTimeout(detT);detT=setTimeout(runDetect,450)}
if(lang){ta.addEventListener('input',detectSoon);lang.addEventListener('change',function(){if(lang.value==='auto')runDetect()});if(ta.value.trim())detectSoon()}
var saveB=$('#token-save'),forget=$('#token-forget');
if(saveB)saveB.addEventListener('click',function(){var v=(tin.value||'').trim();if(!v)return;fetch('/api/pastes?limit=1',{headers:{authorization:'Bearer '+v}}).then(function(r){if(r.ok){tok=v;store(TK,v);tin.value='';tf.open=false;$('#token-err').hidden=true;mode();count()}else{$('#token-err').hidden=false}},function(){$('#token-err').hidden=false})});
if(forget)forget.addEventListener('click',function(){tok='';store(TK,null);mode();count()});

function row(p,del){var li=document.createElement('li'),a=document.createElement('a');a.href=p.url;a.textContent=p.title||p.id;var m=document.createElement('span');m.className='label';m.textContent=[p.lang,p.expires?'until '+when(p.expires):'kept'].filter(Boolean).join(' · ');li.append(a,m);if(del){var d=document.createElement('a');d.href=del;d.className='label del';d.textContent='Delete';li.append(d)}return li}
function list(){var box=$('#mine'),ul=$('#mine ul');if(!box)return;ul.replaceChildren();
  if(tok){$('#mine-h').textContent='Your pastes';fetch('/api/pastes?limit=20',{headers:{authorization:'Bearer '+tok}}).then(function(r){return r.ok?r.json():{pastes:[]}}).then(function(j){(j.pastes||[]).forEach(function(p){ul.append(row({url:p.url,title:p.title,id:p.id,lang:p.lang,expires:p.expires_at?p.expires_at*1000:0},null))});box.hidden=!ul.children.length},function(){box.hidden=true});return}
  $('#mine-h').textContent='Made in this browser';var a=mine();saveMine(a);a.forEach(function(p){ul.append(row(p,p.del))});box.hidden=!a.length}
mode();count();
})();`;
