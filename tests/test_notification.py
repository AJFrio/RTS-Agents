import pytest
from playwright.sync_api import Page, expect
import os

def test_notification_system(page: Page):
    # Load the application
    page.goto(f"file://{os.path.abspath('index.html')}")

    # Mock window.electronAPI and initial state
    page.evaluate("""
        // Mock AudioContext
        window.audioContextCreated = false;
        window.oscillatorStarted = false;

        window.AudioContext = class {
            constructor() {
                window.audioContextCreated = true;
                this.currentTime = 0;
                this.destination = {};
            }
            createOscillator() {
                return {
                    type: '',
                    frequency: {
                        setValueAtTime: () => {},
                        exponentialRampToValueAtTime: () => {}
                    },
                    connect: () => {},
                    start: () => { window.oscillatorStarted = true; },
                    stop: () => {}
                };
            }
            createGain() {
                return {
                    gain: {
                        setValueAtTime: () => {},
                        exponentialRampToValueAtTime: () => {}
                    },
                    connect: () => {}
                };
            }
        };
        window.webkitAudioContext = window.AudioContext;

        // Mock electronAPI
        window.electronAPI = {
            getAgents: async () => ({
                agents: window.mockAgents || [],
                counts: { gemini: 0, jules: 0, cursor: 0, total: 0 },
                errors: []
            }),
            getSettings: async () => ({ settings: {} }),
            onRefreshTick: () => {},
            getConnectionStatus: async () => ({}),
        };
    """)

    # 1. Initial Load with a running agent
    # We call loadAgents() to trigger the state update internally
    page.evaluate("""
        window.mockAgents = [{
            provider: 'jules',
            rawId: 'task-123',
            name: 'Test Task',
            status: 'running',
            updatedAt: new Date().toISOString()
        }];
        window.loadAgents();
    """)

    # Verify no toast initially
    expect(page.locator("text=Task completed: Test Task")).to_be_hidden()

    # 2. Update agent to completed
    # Calling loadAgents again should trigger checkForCompletions inside it
    page.evaluate("""
        window.mockAgents = [{
            provider: 'jules',
            rawId: 'task-123',
            name: 'Test Task',
            status: 'completed',
            updatedAt: new Date().toISOString()
        }];
        window.loadAgents();
    """)

    # Verify toast appears
    expect(page.locator("text=Task completed: Test Task")).to_be_visible()

    # Verify sound played
    audio_context_created = page.evaluate("window.audioContextCreated")
    oscillator_started = page.evaluate("window.oscillatorStarted")

    assert audio_context_created == True
    assert oscillator_started == True
