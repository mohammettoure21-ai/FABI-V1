'use client';
import {useEffect,useRef} from 'react';
export default function ConversationFocus({viewKey,lastMessageId,older,focus}){
 const nearBottom=useRef(true);
 useEffect(()=>{
  const section=document.getElementById('conversation'),history=section?.querySelector('.conversation-history');
  if(!history)return;
  history.scrollTop=older?0:history.scrollHeight;
  nearBottom.current=!older;
  if(focus)section.scrollIntoView({block:'start',behavior:'instant'});
  const track=()=>{nearBottom.current=history.scrollHeight-history.scrollTop-history.clientHeight<90;};
  history.addEventListener('scroll',track,{passive:true});
  return()=>history.removeEventListener('scroll',track);
  // Refreshing the same thread must not move the page or discard the reading position.
 },[viewKey,older,focus]);
 useEffect(()=>{
  const history=document.querySelector('#conversation .conversation-history');
  if(history&&nearBottom.current&&!older)history.scrollTop=history.scrollHeight;
 },[lastMessageId,older]);
 return null;
}
