import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
// Disposable PostgreSQL test; never connects to Supabase.
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const read=f=>readFileSync(`${process.cwd()}/database/${f}.sql`,'utf8');
await db.exec(`create role anon; create role authenticated; create role service_role;
create table profiles(id uuid primary key, visningsnavn text, status text, koen text, rolle text);
create table newresults(id bigint generated always as identity primary key,date date,"holdA1" text,"holdA2" text,"holdB1" text,"holdB2" text,"scoreA" int,"scoreB" int,finish bool,event bool,tiebreak text,kampid int,indberettet_af text);`);
for(const f of ['player_matches','player_match_booking','player_match_delete','partner_tournaments','partner_tournaments_per_division','partner_tournaments_winter_2027','partner_league','partner_league_manual_payment']) await db.exec(read(f));
await db.exec(read('partner_league_manual_payment'));
const ids=Array.from({length:6},(_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`);
for(let i=0;i<ids.length;i++) await db.query('insert into profiles values($1,$2,$3,$4,$5)',[ids[i],`Spiller ${i+1}`,'active',i%2?'kvinde':'mand',i===5?'admin':'spiller']);
const tournament='8296c11a-14e7-4c8e-b27d-f0a3bd4023e3';
await db.query('update partner_tournaments set closes_on=current_date+10, play_date=current_date+365 where id=$1',[tournament]);
const register=async (a,b,division='open',phone='12345678')=>(await db.query('select register_manual_partner_team($1,$2,$3,$4,$5) as id',[tournament,a,b,division,phone])).rows[0].id;
await assert.rejects(register(ids[0],ids[1],'open','123'),{code:'22023'});
const first=await register(ids[0],ids[1]);
assert.equal((await db.query('select status from partner_registrations where id=$1',[first])).rows[0].status,'pending');
await assert.rejects(register(ids[0],ids[2]),{code:'23505'});
await register(ids[0],ids[1],'mix');
const second=await register(ids[2],ids[3]);
const confirm=(actor,id)=>db.query('select confirm_manual_partner_payment($1,$2,$3)',[actor,id,tournament]);
await assert.rejects(confirm(ids[0],first),{code:'42501'});
await confirm(ids[5],first); await confirm(ids[5],first); await confirm(ids[5],second);
await db.query('update partner_tournaments set closes_on=current_date-1 where id=$1',[tournament]);
await db.query('select publish_partner_league_pools($1,$2,$3)',[ids[5],tournament,JSON.stringify(Object.fromEntries(ids.map((_,i)=>[`Spiller ${i+1}`,1000])))]);
const pools=async actor=>(await db.query('select partner_league_pools_for($1,$2) as pools',[actor,tournament])).rows[0].pools;
assert.equal((await pools(ids[0]))[0].teams[0].contact_phone,'12345678');
assert.equal((await pools(ids[4]))[0].teams[0].contact_phone,null);
await db.exec('set role authenticated');
await assert.rejects(register(ids[4],ids[5]),{code:'42501'});
console.log('PASS: migration twice, phone validation, per-division reservation, pending status, admin-only payment, idempotency, pools, private phone access, RPC permissions');
await db.close();

const module = {exports:{}};
vm.runInNewContext(ts.transpile(readFileSync('lib/partnerLeague.ts','utf8'), {module:ts.ModuleKind.CommonJS}), {exports:module.exports});
const {leagueStandings} = module.exports;
for (const [sets, points] of [ [[{a:6,b:0},{a:6,b:0}],[4,1]], [[{a:6,b:0},{a:0,b:6},{a:6,b:0}],[3,2]] ]) {
  const rows = leagueStandings({teams:[{id:'a',names:['A','B']},{id:'b',names:['C','D']}],matches:[{team_a:'a',team_b:'b',sets}]});
  assert.equal(rows.find(row=>row.id==='a').points, points[0]);
  assert.equal(rows.find(row=>row.id==='b').points, points[1]);
}
console.log('PASS: 4/3/2/1 pool scoring');
