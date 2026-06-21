import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameProvider } from './src/store/GameContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <GameProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </GameProvider>
    </SafeAreaProvider>
  );
}
