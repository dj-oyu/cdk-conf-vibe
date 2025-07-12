#!/usr/bin/env node
/**
 * Test Runner Script for Frontend Core
 * Provides improved test execution with better error handling and reporting
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const NODE_OPTIONS = '--experimental-vm-modules';
const JEST_COMMON_OPTS = '--config jest.config.js --maxWorkers=1 --forceExit';

// Color codes for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(text) {
    const border = '═'.repeat(text.length + 4);
    log(`\n${border}`, 'cyan');
    log(`  ${text}  `, 'cyan');
    log(`${border}`, 'cyan');
}

function runCommand(command, description) {
    try {
        log(`\n▶ ${description}`, 'blue');
        log(`Command: ${command}`, 'yellow');
        
        const output = execSync(`pnpx ${command}`, { 
            stdio: 'inherit',
            cwd: 'frontend',
            env: { ...process.env, NODE_OPTIONS }
        });
        
        log(`✅ ${description} completed successfully`, 'green');
        return true;
    } catch (error) {
        log(`❌ ${description} failed`, 'red');
        log(`Error code: ${error.status}`, 'red');
        return false;
    }
}

function getTestSuites() {
    return {
        unit: {
            name: 'Unit Tests (Core Components)',
            files: ['tests/collaboration.test.js', 'tests/webrtc.test.js', 'tests/presence.test.js'],
            description: 'Tests for CollaborationEngine, WebRTCManager, and PresenceManager'
        },
        integration: {
            name: 'Integration Tests',
            files: ['tests/core-integration.test.js'],
            description: 'Tests for WhiteboardCore integration layer'
        },
        offline: {
            name: 'Offline Sync Tests',
            files: ['tests/offline-sync.test.js'],
            description: 'Tests for OfflineSyncManager'
        },
        error: {
            name: 'Error Handler Tests',
            files: ['tests/error-handler.test.js'],
            description: 'Tests for ErrorHandler and reconnection logic'
        }
    };
}

function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    
    logHeader('Frontend Core Test Runner');
    
    switch (command) {
        case 'all':
            logHeader('Running All Tests');
            return runCommand(`jest ${JEST_COMMON_OPTS}`, 'All tests');
            
        case 'unit':
            logHeader('Running Unit Tests');
            const unitSuite = getTestSuites().unit;
            log(unitSuite.description, 'cyan');
            return runCommand(`jest ${unitSuite.files.join(' ')} ${JEST_COMMON_OPTS}`, unitSuite.name);
            
        case 'integration':
            logHeader('Running Integration Tests');
            const integrationSuite = getTestSuites().integration;
            log(integrationSuite.description, 'cyan');
            return runCommand(`jest ${integrationSuite.files.join(' ')} ${JEST_COMMON_OPTS}`, integrationSuite.name);
            
        case 'offline':
            logHeader('Running Offline Sync Tests');
            const offlineSuite = getTestSuites().offline;
            log(offlineSuite.description, 'cyan');
            return runCommand(`jest ${offlineSuite.files.join(' ')} ${JEST_COMMON_OPTS}`, offlineSuite.name);
            
        case 'error':
            logHeader('Running Error Handler Tests');
            const errorSuite = getTestSuites().error;
            log(errorSuite.description, 'cyan');
            return runCommand(`jest ${errorSuite.files.join(' ')} ${JEST_COMMON_OPTS}`, errorSuite.name);
            
        case 'coverage':
            logHeader('Running Tests with Coverage');
            return runCommand(`jest --coverage ${JEST_COMMON_OPTS}`, 'Coverage report');
            
        case 'watch':
            logHeader('Running Tests in Watch Mode');
            log('Press Ctrl+C to stop watching', 'yellow');
            return runCommand(`jest --watch ${JEST_COMMON_OPTS}`, 'Watch mode');
            
        case 'debug':
            logHeader('Running Tests in Debug Mode');
            log('Connect your debugger to inspect test execution', 'yellow');
            return runCommand(`jest --runInBand --no-cache --detectOpenHandles`, 'Debug mode');
            
        case 'lint':
            logHeader('Running Linter');
            return runCommand('eslint . --ext .js', 'ESLint check');
            
        case 'lint:fix':
            logHeader('Running Linter with Auto-fix');
            return runCommand('eslint . --ext .js --fix', 'ESLint auto-fix');
            
        case 'format':
            logHeader('Running Prettier Format');
            return runCommand('prettier --write .', 'Prettier format');
            
        case 'format:check':
            logHeader('Checking Prettier Format');
            return runCommand('prettier --check .', 'Prettier check');
            
        case 'status':
            logHeader('Test Status Overview');
            showTestStatus();
            return true;
            
        case 'help':
        default:
            showHelp();
            return true;
    }
}

function showTestStatus() {
    const suites = getTestSuites();
    
    log('\n📊 Test Suite Overview:', 'bold');
    Object.entries(suites).forEach(([key, suite]) => {
        log(`\n• ${suite.name}`, 'cyan');
        log(`  Description: ${suite.description}`, 'reset');
        log(`  Files: ${suite.files.join(', ')}`, 'yellow');
        log(`  Run with: node scripts/test-runner.js ${key}`, 'magenta');
    });
    
    try {
        const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
        log('\n📋 Available npm scripts:', 'bold');
        Object.entries(packageJson.scripts)
            .filter(([name]) => name.startsWith('test'))
            .forEach(([name, script]) => {
                log(`  pnpm ${name}`, 'cyan');
            });
    } catch (error) {
        log('Could not read package.json', 'red');
    }
}

function showHelp() {
    log('\n🚀 Frontend Core Test Runner', 'bold');
    log('\nUsage: node scripts/test-runner.js <command>', 'cyan');
    
    log('\n📝 Available Commands:', 'bold');
    
    const commands = [
        ['all', 'Run all tests'],
        ['unit', 'Run unit tests (collaboration, webrtc, presence)'],
        ['integration', 'Run integration tests (core-integration)'],
        ['offline', 'Run offline sync tests'],
        ['error', 'Run error handler tests'],
        ['coverage', 'Run tests with coverage report'],
        ['watch', 'Run tests in watch mode'],
        ['debug', 'Run tests in debug mode'],
        ['lint', 'Run ESLint'],
        ['lint:fix', 'Run ESLint with auto-fix'],
        ['format', 'Run Prettier format'],
        ['format:check', 'Check Prettier formatting'],
        ['status', 'Show test status overview'],
        ['help', 'Show this help message']
    ];
    
    commands.forEach(([cmd, desc]) => {
        log(`  ${cmd.padEnd(15)} ${desc}`, 'cyan');
    });
    
    log('\n📚 Examples:', 'bold');
    log('  node scripts/test-runner.js unit          # Run core component tests', 'yellow');
    log('  node scripts/test-runner.js coverage     # Generate coverage report', 'yellow');
    log('  node scripts/test-runner.js watch        # Watch for changes', 'yellow');
    log('  node scripts/test-runner.js status       # Show overview', 'yellow');
    
    log('\n💡 Tips:', 'bold');
    log('  • Use "unit" command for quick feedback during development', 'reset');
    log('  • Use "coverage" to ensure code coverage meets requirements', 'reset');
    log('  • Use "watch" for test-driven development (TDD)', 'reset');
    log('  • Use "debug" if tests are failing unexpectedly', 'reset');
}

// Run the script
const success = main();
process.exit(success ? 0 : 1);