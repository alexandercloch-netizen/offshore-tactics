import React from 'react';
import { DefaultTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabParamList, RootStackParamList } from '../types';
import { colors, fontWeight } from '../theme';
import { isSupabaseConfigured } from '../lib/supabase';
import TabBarIcon from './TabBarIcon';
import HomeScreen from '../screens/HomeScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AuthScreen from '../screens/AuthScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import RaceSelectScreen from '../screens/RaceSelectScreen';
import BoatSelectScreen from '../screens/BoatSelectScreen';
import CrewSelectScreen from '../screens/CrewSelectScreen';
import ProvisioningScreen from '../screens/ProvisioningScreen';
import RaceMapScreen from '../screens/RaceMapScreen';
import ResultsScreen from '../screens/ResultsScreen';
import FleetScreen from '../screens/FleetScreen';
import BoatBuilderScreen from '../screens/BoatBuilderScreen';
import SailLockerScreen from '../screens/SailLockerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

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

const headerOptions = {
  headerStyle: { backgroundColor: colors.deepSea },
  headerTintColor: colors.brassLight,
  headerTitleStyle: { fontWeight: fontWeight.bold, color: colors.foam },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.abyss },
};

// The app's main surface: a bottom-tab bar. Race is the personalised launchpad;
// the rest are the fleet, the global board and the player's profile/settings.
const MainTabs: React.FC = () => (
  <Tab.Navigator
    initialRouteName="Race"
    screenOptions={({ route }) => ({
      ...headerOptions,
      tabBarIcon: ({ focused, size }) => (
        <TabBarIcon route={route.name} focused={focused} size={size} />
      ),
      tabBarActiveTintColor: colors.brassLight,
      tabBarInactiveTintColor: colors.slate,
      tabBarStyle: {
        backgroundColor: colors.deepSea,
        borderTopColor: colors.hull,
      },
    })}
  >
    <Tab.Screen name="Race" component={HomeScreen} options={{ headerShown: false }} />
    <Tab.Screen name="Fleet" component={FleetScreen} options={{ title: 'My Fleet' }} />
    {isSupabaseConfigured ? (
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Leaderboard' }} />
    ) : null}
    <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
  </Tab.Navigator>
);

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator initialRouteName="Main" screenOptions={headerOptions}>
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="Onboarding"
          component={OnboardingScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ title: 'Account', presentation: 'modal' }}
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
        <Stack.Screen
          name="BoatBuilder"
          component={BoatBuilderScreen}
          options={{ title: 'Build a Boat' }}
        />
        <Stack.Screen
          name="SailLocker"
          component={SailLockerScreen}
          options={{ title: 'Sail Locker' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
