// app.js
// 目標：純前端最少站數與最少轉乘查詢。UTF-8、模組化、詳細註解、UI 不亂做。

// 讀取 routes.json
export async function loadRoutes(url){
  const r = await fetch(url, {cache:'no-store'});
  if(!r.ok) throw new Error(await r.text());
  return await r.json();
}

// 取得所有站名（供檢查或自動完成功能擴充）
export function stationNames(routeData){
  const set = new Set();
  for(const line of routeData) for(const s of line.stations) set.add(s);
  return Array.from(set);
}

// 建圖：adj 鄰接表；edgeLine 邊對應線名；stationLines 站屬線
function buildGraph(routeData){
  const adj = new Map();         // Map<站, Set<相鄰站>>
  const edgeLine = new Map();    // Map<'A|B', 線名>
  const stationLines = new Map();// Map<站, string[]>

  const key = (a,b)=>`${a}|${b}`;

  const addNode = (s)=>{ if(!adj.has(s)) adj.set(s, new Set()); };
  const addEdge = (a,b,line)=>{
    adj.get(a).add(b); adj.get(b).add(a);
    edgeLine.set(key(a,b), line); edgeLine.set(key(b,a), line);
  };

  for(const {line, stations} of routeData){
    for(const s of stations){
      addNode(s);
      const arr = stationLines.get(s) || [];
      if(arr[arr.length-1] !== line) { arr.push(line); }
      stationLines.set(s, arr);
    }
    for(let i=0;i<stations.length-1;i++){
      addNode(stations[i]); addNode(stations[i+1]);
      addEdge(stations[i], stations[i+1], line);
    }
  }
  return {adj, edgeLine, stationLines};
}

// 回溯（狀態包含站與線）
function reconstruct(prev, endState){
  const path = [];
  let cur = endState; // [node,line]
  while(prev.has(stateKey(cur))){
    const [node] = cur;
    path.push(node);
    cur = prev.get(stateKey(cur));
  }
  path.push(cur[0]);
  path.reverse();
  return path;
}
const stateKey = (st)=>`${st[0]}||${st[1]}`;

// 計算轉乘次數
function countTransfers(path, edgeLine){
  if(path.length < 3) return 0;
  const key=(a,b)=>`${a}|${b}`;
  let t=0;
  for(let i=1;i<path.length-1;i++){
    const l1=edgeLine.get(key(path[i-1], path[i]))||'';
    const l2=edgeLine.get(key(path[i], path[i+1]))||'';
    if(l1!==l2) t++;
  }
  return t;
}

// 產生段落 [(站, 線)]，線為進站前一段
function segmentWithLines(path, edgeLine){
  if(path.length===0) return [];
  const key=(a,b)=>`${a}|${b}`;
  const out=[[path[0], '']];
  for(let i=1;i<path.length;i++){
    const l=edgeLine.get(key(path[i-1], path[i]))||'';
    out.push([path[i], l]);
  }
  return out;
}

// 實際途經字串（中間站加括號）
function detailString(path){
  if(path.length===0) return '';
  if(path.length===1) return path[0];
  const out=[path[0]];
  for(let i=1;i<path.length;i++){
    const s=path[i];
    out.push(i<path.length-1 ? `→(${s})` : `→${s}`);
  }
  return out.join('');
}

// 最少站數 BFS
function shortestStops(adj, src, dst){
  const q=[src];
  const seen=new Set([src]);
  const prev=new Map([[src,null]]);
  while(q.length){
    const u=q.shift();
    if(u===dst) break;
    for(const v of (adj.get(u)||[])){
      if(!seen.has(v)){
        seen.add(v); prev.set(v,u); q.push(v);
      }
    }
  }
  if(!prev.has(dst)) return [];
  const path=[];
  let cur=dst;
  while(cur!==null){ path.push(cur); cur=prev.get(cur)??null; }
  path.reverse();
  return path;
}

// 最少轉乘優先，再最少站數（簡易優先佇列，用 Array + sort，圖不大足夠）
function shortestTransfers(adj, edgeLine, src, dst){
  const pq=[]; // 每次取最小：(tr, steps, node, line)
  pq.push([0,0,src,'']);
  const best=new Map(); // key=(node||line) -> [tr, steps]
  best.set(stateKey([src,'']), [0,0]);
  const prev=new Map(); // key(state) -> state

  while(pq.length){
    // 取出成本最小
    pq.sort((a,b)=> a[0]-b[0] || a[1]-b[1]);
    const [tr, steps, u, curLine]=pq.shift();
    if(u===dst) return reconstruct(prev, [u, curLine]);
    for(const v of (adj.get(u)||[])){
      const eLine = edgeLine.get(`${u}|${v}`) || '';
      const ntr = tr + ((curLine===''||curLine===eLine)?0:1);
      const nsteps = steps + 1;
      const key = stateKey([v, eLine]);
      const old = best.get(key);
      if(!old || ntr<old[0] || (ntr===old[0] && nsteps<old[1])){
        best.set(key, [ntr, nsteps]);
        prev.set(key, [u, curLine]);
        pq.push([ntr, nsteps, v, eLine]);
      }
    }
  }
  return [];
}

// 主查詢
export function queryRoute(routeData, src, dst, mode){
  const {adj, edgeLine} = buildGraph(routeData);
  if(!adj.has(src) || !adj.has(dst)) return {error:'站名不存在'};
  let path=[];
  if(mode==='stops') path = shortestStops(adj, src, dst);
  else if(mode==='transfers') path = shortestTransfers(adj, edgeLine, src, dst);
  else return {error:'mode 必須為 stops 或 transfers'};
  if(path.length===0) return {error:'無可行路徑'};
  return {
    path,
    stops: path.length-1,
    transfers: countTransfers(path, edgeLine),
    detail: detailString(path),
    segments: segmentWithLines(path, edgeLine)
  };
}
