// Churchill Falls Information Assistant - SIMPLE FAST VERSION
// Voice Mode: Fast responses from core docs (2-3 seconds)
// Text Mode: Comprehensive responses from all docs (8-12 seconds)

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// ElevenLabs configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const MONTHLY_VOICE_LIMIT = 100000; // Characters per month
let monthlyVoiceUsage = 0;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

console.log('\n' + '╔════════════════════════════════════════════════╗');
console.log('║   Churchill Falls SIMPLE FAST Assistant        ║');
console.log('╚════════════════════════════════════════════════╝\n');

// ======================
// DOCUMENT LOADING
// ======================

// Core documents - ALWAYS loaded (for voice mode speed)
const CORE_DOCS = [
    'MOU_Churchill_Falls_Dec_12_2024_clean_text.txt',
    'Doug-video-series-video1.txt',
    'Doug-video-series-video2A.txt',
    'Doug-video-series-video2B.txt',
    'Doug-video-series-video3A.txt',
    'Doug-video-series-video3B.txt',
    'Doug-video-series-video4.txt',
    'Churchill-falls-consolidated-financial-statements-2024.txt'
];

// Supplementary documents - loaded only for text mode
const SUPPLEMENTARY_DOCS = [
    'LOCKE analysis of MOU CF.txt',
    'Churchill-Falls-2023-financial-statement.txt',
    'Lower-Churchill-Project-Combined-Financial-Statements-2024.txt'
];

let coreDocsContext = '';
let allDocsContext = '';

function loadDocuments() {
    console.log('============================================');
    console.log('Loading documents...');
    console.log('============================================');
    
    const docsDir = path.join(__dirname, 'core-documents');
    let coreTokens = 0;
    let totalTokens = 0;
    
    // Load core docs
    CORE_DOCS.forEach(filename => {
        try {
            const filepath = path.join(docsDir, filename);
            const content = fs.readFileSync(filepath, 'utf-8');
            const tokens = Math.ceil(content.length / 4);
            coreDocsContext += `\n\n=== ${filename} ===\n${content}`;
            coreTokens += tokens;
            console.log(`✓ Core: ${filename} (${(content.length / 1024).toFixed(2)} KB, ~${tokens} tokens)`);
        } catch (error) {
            console.log(`⚠ Core doc not found: ${filename}`);
        }
    });
    
    // All docs = core docs
    allDocsContext = coreDocsContext;
    
    // Add supplementary docs to all docs
    SUPPLEMENTARY_DOCS.forEach(filename => {
        try {
            const filepath = path.join(docsDir, filename);
            const content = fs.readFileSync(filepath, 'utf-8');
            const tokens = Math.ceil(content.length / 4);
            allDocsContext += `\n\n=== ${filename} ===\n${content}`;
            totalTokens += tokens;
            console.log(`✓ Supplementary: ${filename} (${(content.length / 1024).toFixed(2)} KB, ~${tokens} tokens)`);
        } catch (error) {
            console.log(`⚠ Supplementary doc not found: ${filename}`);
        }
    });
    
    totalTokens += coreTokens;
    
    console.log('\n✓ Documents loaded successfully');
    console.log(`  - Core docs: ~${coreTokens} tokens (voice mode)`);
    console.log(`  - All docs: ~${totalTokens} tokens (text mode)`);
    console.log('============================================\n');
}

loadDocuments();

// ======================
// ELEVENLABS AUDIO
// ======================

function prepareTextForSpeech(text) {
    return text
        .replace(/\*\*/g, '')
        .replace(/###/g, '')
        .replace(/##/g, '')
        .replace(/#/g, '')
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function convertToSpeech(text) {
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
        throw new Error('ElevenLabs credentials not configured');
    }
    
    if (monthlyVoiceUsage >= MONTHLY_VOICE_LIMIT) {
        throw new Error('Monthly voice quota exceeded');
    }
    
    const speechText = prepareTextForSpeech(text);
    
    // Truncate if too long for ElevenLabs
    let finalText = speechText;
    if (speechText.length > 5000) {
        const sentences = speechText.match(/[^.!?]+[.!?]+/g) || [];
        if (sentences.length > 3) {
            finalText = sentences.slice(0, 3).join(' ');
        }
    }
    
    monthlyVoiceUsage += finalText.length;
    console.log(`Voice usage: ${monthlyVoiceUsage}/${MONTHLY_VOICE_LIMIT} chars (${((monthlyVoiceUsage/MONTHLY_VOICE_LIMIT)*100).toFixed(1)}%)`);
    
    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
                text: finalText,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true
                }
            })
        }
    );
    
    if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
    }
    
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    return `data:audio/mpeg;base64,${base64Audio}`;
}

// ======================
// CHAT ENDPOINT
// ======================

app.post('/api/chat', async (req, res) => {
    try {
        const { message, isVoiceMode } = req.body;
        
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        console.log('\n' + '='.repeat(60));
        console.log(`📝 Question: "${message}"`);
        console.log(`🎤 Mode: ${isVoiceMode ? 'VOICE (fast, core docs)' : 'TEXT (comprehensive, all docs)'}`);
        console.log('='.repeat(60));
        
        // Choose context based on mode
        const contextDocs = isVoiceMode ? coreDocsContext : allDocsContext;
        const systemPrompt = isVoiceMode ? getVoiceSystemPrompt() : getTextSystemPrompt();
        
        const startTime = Date.now();
        
        // Call Claude
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: isVoiceMode ? 500 : 4096,
            system: systemPrompt + '\n\n<documents>\n' + contextDocs + '\n</documents>',
            messages: [{ role: 'user', content: message }]
        });
        
        const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        let finalText = '';
        for (const block of response.content) {
            if (block.type === 'text') {
                finalText += block.text;
            }
        }
        
        console.log(`⏱️ Response time: ${responseTime}s`);
        console.log(`📊 Response: ${finalText.split(/\s+/).length} words`);
        
        // Generate audio for voice mode
        let audioData = null;
        if (isVoiceMode && monthlyVoiceUsage < MONTHLY_VOICE_LIMIT) {
            try {
                audioData = await convertToSpeech(finalText);
                console.log('✓ Voice generated successfully');
            } catch (error) {
                console.error('✗ Voice generation failed:', error.message);
            }
        }
        
        res.json({
            text: finalText,
            audio: audioData,
            responseTime: responseTime,
            mode: isVoiceMode ? 'voice' : 'text'
        });
        
    } catch (error) {
        console.error('Error in chat:', error);
        res.status(500).json({
            error: 'Failed to get response',
            details: error.message
        });
    }
});

// ======================
// SYSTEM PROMPTS
// ======================

function getVoiceSystemPrompt() {
    return `You are a helpful assistant for the Churchill Falls hydroelectric project and the December 2024 MOU between Newfoundland & Labrador and Quebec.

<VOICE_MODE_CONVERSATIONAL>
You are in conversational voice mode. Respond naturally and concisely as if speaking to someone.

Guidelines:
- Keep responses to 2-4 sentences (50-100 words)
- Be natural and conversational
- If the question requires detailed information beyond what's in your core documents, end with: "For a comprehensive analysis, click the Read Full Analysis link."
- No markdown formatting, bullet points, or headers
- Speak as if explaining to a friend

You have access to core documents: the MOU, Doug May's video analysis series, and 2024 financial statements.

For simple questions, answer directly. For complex questions requiring supplementary documents, give a concise answer from what you know and suggest the detailed text mode.
</VOICE_MODE_CONVERSATIONAL>`;
}

function getTextSystemPrompt() {
    return `You are a helpful assistant for the Churchill Falls hydroelectric project and the December 2024 MOU between Newfoundland & Labrador and Quebec.

<TEXT_MODE_COMPREHENSIVE>
You are in deep research text mode. Provide comprehensive, detailed responses.

Guidelines:
- Use all available documents to give thorough answers
- Include specific numbers, dates, and citations
- Use markdown formatting (headers, bold, lists) as appropriate
- Provide context and background
- Reference sources when making claims
- Be as detailed as necessary to fully answer the question

You have access to the complete document library including the MOU, all financial statements, Doug May's analysis, and expert assessments.
</TEXT_MODE_COMPREHENSIVE>`;
}

// ======================
// HEALTH CHECK
// ======================

app.get('/health', (req, res) => {
    res.json({ status: 'ok', voice: !!ELEVENLABS_API_KEY });
});

// ======================
// START SERVER
// ======================

app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════╗');
    console.log(`║  Server running on port ${PORT}                    ║`);
    console.log('╠════════════════════════════════════════════════╣');
    console.log('║  SIMPLE FAST SYSTEM:                           ║');
    console.log('║  • Voice: Core docs (fast)                     ║');
    console.log('║  • Text: All docs (comprehensive)              ║');
    console.log('║  • ElevenLabs: ' + (ELEVENLABS_API_KEY ? '✓' : '✗') + '                                ║');
    console.log('╚════════════════════════════════════════════════╝');
});