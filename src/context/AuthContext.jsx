import React, { createContext, useContext, useState, useEffect } from 'react';
import { ROLES, hasPermission, ROLE_BADGES } from '../utils/rbacPermissions';

const AuthContext = createContext();

const GUEST_USER = {
  id: 'usr_guest',
  name: 'Guest Developer',
  email: 'guest@collabide.dev',
  role: ROLES.VIEWER,
  avatarColor: '#9CA3AF',
  initials: 'GD'
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('collab_user');
    return savedUser ? JSON.parse(savedUser) : GUEST_USER;
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem('collab_token') || null;
  });

  // Verify token on mount
  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.user) {
            setCurrentUser(data.user);
            localStorage.setItem('collab_user', JSON.stringify(data.user));
          } else {
            logout();
          }
        })
        .catch(() => {});
    }
  }, [token]);

  const loginSuccess = (user, jwtToken) => {
    setCurrentUser(user);
    setToken(jwtToken);
    localStorage.setItem('collab_user', JSON.stringify(user));
    localStorage.setItem('collab_token', jwtToken);
  };

  const logout = () => {
    setCurrentUser(GUEST_USER);
    setToken(null);
    localStorage.removeItem('collab_user');
    localStorage.removeItem('collab_token');
  };

  const can = (permission) => {
    return hasPermission(currentUser.role, permission);
  };

  // Helper for authorized fetch
  const authFetch = (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      token,
      loginSuccess,
      logout,
      can,
      authFetch,
      roleBadge: ROLE_BADGES[currentUser.role] || ROLE_BADGES.viewer
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
