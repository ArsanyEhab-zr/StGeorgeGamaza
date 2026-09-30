import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export default function BackButtonHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener = null;

    CapacitorApp.addListener('backButton', () => {
      // If we are at the root or home, exit the app
      if (location.pathname === '/' || location.pathname === '/home') {
        CapacitorApp.exitApp();
      } else {
        // Otherwise, navigate back natively within the router
        navigate(-1);
      }
    }).then(l => {
        listener = l;
    });

    return () => {
      if (listener) {
        listener.remove();
      }
    };
  }, [location.pathname, navigate]);

  return null;
}
