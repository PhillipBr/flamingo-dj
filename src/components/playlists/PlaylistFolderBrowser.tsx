import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Playlist } from "../../types/playlist";
import { musicFolders, folderPlaylistId, folderMembers, playlistFolder, resolveFolderPlaylist } from "../../utils/playlistFolders";

export default function PlaylistFolderBrowser({playlists, parent}: {playlists:Playlist[]; parent?:string}) {
  const [expanded,setExpanded]=useState<Set<string>>(new Set());
  const href=(id:string)=>`/playlists/${encodeURIComponent(id)}`;
  function toggle(id:string) {setExpanded(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next;});}
  function renderFolder(id:string,depth:number):ReactNode {
    const folder=musicFolders.find(f=>f.id===id)!;
    const members=folderMembers(id,playlists);
    const total=resolveFolderPlaylist(folderPlaylistId(id),playlists)?.trackIds.length??0;
    const open=expanded.has(id);
    return <div key={id} style={{marginLeft:depth?16:0}}>
      <div style={{display:"flex",gap:12,alignItems:"center",padding:"13px 10px",borderBottom:"1px solid #ffffff18"}}>
        <button type="button" onClick={()=>toggle(id)} aria-expanded={open} aria-label={`${open?"Cerrar":"Abrir"} ${folder.name}`} style={{background:"transparent",color:"inherit",border:0,cursor:"pointer",minWidth:32}}>{open?"▾":"▸"}</button>
        <Link to={href(folderPlaylistId(id))} style={{color:"inherit",textDecoration:"none",flex:1,fontWeight:600}}>📁 {folder.name}</Link>
        <span style={{opacity:.65,fontSize:12}}>{members.length} playlists · {total} tracks</span>
      </div>
      {open&&<div>
        {musicFolders.filter(f=>f.parent===id).map(f=>renderFolder(f.id,1))}
        {playlists.filter(p=>playlistFolder(p)===id).map(p=><Link key={p.id} to={href(p.id)} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"12px 16px 12px 48px",color:"inherit",textDecoration:"none"}}><span>♫ {p.name}</span><span style={{opacity:.65}}>{p.trackIds.length}</span></Link>)}
        {!members.length&&<p style={{paddingLeft:48,opacity:.6}}>Sin playlists todavía</p>}
      </div>}
    </div>;
  }
  return <nav aria-label="Carpetas musicales" style={{margin:"18px 0",border:"1px solid #ffffff18",borderRadius:12,overflow:"hidden"}}>
    {musicFolders.filter(f=>f.parent===parent).map(f=>renderFolder(f.id,0))}
    {parent&&playlists.filter(p=>playlistFolder(p)===parent).map(p=><Link key={p.id} to={href(p.id)} style={{display:"block",padding:12,color:"inherit"}}>♫ {p.name} · {p.trackIds.length} tracks</Link>)}
  </nav>;
}
