'use client';
import {createContext,useContext,useEffect,useState} from 'react';
import {request} from './api';
interface User {id:string;username:string;avatar:string|null}
const AuthContext=createContext<{user:User|null;loading:boolean;error:string|null;login:()=>void;logout:()=>Promise<void>}>({
    user:null,loading:true,error:null,login:()=>{},logout:async()=>{}
});
export function AuthProvider({children}:{children:React.ReactNode}) {
    const [user,setUser]=useState<User|null>(null);
    const [loading,setLoading]=useState(true);
    const [error,setError]=useState<string|null>(null);
    useEffect(() => {
        request<{authenticated:boolean;user?:User}>('/auth/user').then(data => setUser(data.user || null))
            .catch(error => setError(error instanceof Error ? error.message : 'Login unavailable')).finally(() => setLoading(false));
    },[]);
    const login=() => {window.location.assign(new URL('/auth/discord',window.location.origin));};
    const logout=async() => {await request('/auth/logout','POST');setUser(null);};
    return <AuthContext.Provider value={{user,loading,error,login,logout}}>{children}</AuthContext.Provider>;
}
export const useAuth=() => useContext(AuthContext);
