// The game engine and data layer are pure TypeScript (no React Native), so we
// run them under ts-jest in a node environment for fast, deterministic tests.
// The cockpit render tests (*.test.tsx) run in the same environment against a
// lightweight react-native mock (src/testing/) — enough to assert the rendered
// TREE (no Modal mid-race, the chart outside any scroller, exactly six cells)
// without the RN runtime.
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  clearMocks: true,
  transform: {
    // tsconfig uses jsx: 'react-native' (preserve) for Metro; tests need real
    // createElement output.
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
  moduleNameMapper: {
    '^react-native$': '<rootDir>/src/testing/mockReactNative.tsx',
    '^react-native-safe-area-context$': '<rootDir>/src/testing/mockSafeArea.ts',
    '^react-native-svg$': '<rootDir>/src/testing/mockSvg.tsx',
  },
};
