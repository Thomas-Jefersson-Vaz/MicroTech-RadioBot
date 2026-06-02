'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface User {
    id: string;
    username: string;
    avatar: string;
    discriminator: string;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: () => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    login: () => { },
    logout: () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/auth/user')
            .then(res => res.json())
            .then(data => {
                if (data.authenticated) {
                    setUser(data.user);
                }
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const login = () => {
        window.location.href = '/auth/discord';
    };

    const logout = () => {
        window.location.href = '/auth/logout';
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
