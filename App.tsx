import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/store/AuthContext';
import { GameProvider } from './src/store/GameContext';
import AppNavigator from './src/navigation/AppNavigator';
import ConfirmHost from './src/components/ConfirmHost';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <GameProvider>
          <StatusBar style="light" />
          <AppNavigator />
          {/* Root-mounted so the web confirm sheet overlays every screen. */}
          <ConfirmHost />
        </GameProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
