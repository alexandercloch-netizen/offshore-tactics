import React from 'react';
import { DefaultTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { colors, fontWeight } from '../theme';
import HomeScreen from '../screens/HomeScreen';
import AuthScreen from '../screens/AuthScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import RaceSelectScreen from '../screens/RaceSelectScreen';
import BoatSelectScreen from '../screens/BoatSelectScreen';
import CrewSelectScreen from '../screens/CrewSelectScreen';
import ProvisioningScreen from '../screens/ProvisioningScreen';
import RaceMapScreen from '../screens/RaceMapScreen';
import ResultsScreen from '../screens/ResultsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme: Theme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brass,
    background: colors.abyss,
    card: colors.deepSea,
    text: colors.foam,
    border: colors.hull,
    notification: colors.brass,
  },
};

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: colors.deepSea },
          headerTintColor: colors.brassLight,
          headerTitleStyle: { fontWeight: fontWeight.bold, color: colors.foam },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.abyss },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ title: 'Account', presentation: 'modal' }}
        />
        <Stack.Screen
          name="Leaderboard"
          component={LeaderboardScreen}
          options={{ title: 'Leaderboard' }}
        />
        <Stack.Screen
          name="RaceSelect"
          component={RaceSelectScreen}
          options={{ title: 'Select a Race' }}
        />
        <Stack.Screen
          name="BoatSelect"
          component={BoatSelectScreen}
          options={{ title: 'Choose Your Boat' }}
        />
        <Stack.Screen
          name="CrewSelect"
          component={CrewSelectScreen}
          options={{ title: 'Sign Your Crew' }}
        />
        <Stack.Screen
          name="Provisioning"
          component={ProvisioningScreen}
          options={{ title: 'Provision the Boat' }}
        />
        <Stack.Screen
          name="RaceMap"
          component={RaceMapScreen}
          options={{ title: 'Race in Progress', headerBackVisible: false }}
        />
        <Stack.Screen
          name="Results"
          component={ResultsScreen}
          options={{ title: 'Race Result', headerBackVisible: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
