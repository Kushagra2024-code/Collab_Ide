import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@workspace/api-client-react';
import { getMe, login, register, logout, LoginInput, RegisterInput } from '@workspace/api-client-react';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { useLocation } from 'wouter';

// Point the API client at the correct origin. In the Replit proxy environment
// the browser always speaks to the shared domain, but in local dev (Vite on a
// different port) we need an absolute base URL so fetches don't land on the
// Vite dev server instead of the API server.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
setBaseUrl(API_BASE || null);

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  loginUser: (input: LoginInput) => Promise<void>;
  registerUser: (input: RegisterInput) => Promise<void>;
  logoutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Set up custom fetch token getter
    setAuthTokenGetter(() => localStorage.getItem('collab_token'));

    const initAuth = async () => {
      try {
        const token = localStorage.getItem('collab_token');
        if (token) {
          const userData = await getMe();
          setUser(userData);
        }
      } catch (err) {
        console.error('Failed to restore session:', err);
        localStorage.removeItem('collab_token');
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const loginUser = async (input: LoginInput) => {
    const res = await login(input);
    localStorage.setItem('collab_token', res.token);
    setUser(res.user);
    setLocation('/dashboard');
  };

  const registerUser = async (input: RegisterInput) => {
    const res = await register(input);
    localStorage.setItem('collab_token', res.token);
    setUser(res.user);
    setLocation('/dashboard');
  };

  const logoutUser = async () => {
    try {
      await logout();
    } catch (e) {
      console.warn("Logout failed on server, continuing local clear", e);
    }
    localStorage.removeItem('collab_token');
    setUser(null);
    setLocation('/login');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, loginUser, registerUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
