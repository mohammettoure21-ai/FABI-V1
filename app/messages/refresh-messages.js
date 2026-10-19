'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
export default function RefreshMessages(){const router=useRouter();useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')router.refresh();};const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[router]);return null;}
