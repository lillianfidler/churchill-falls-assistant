// ============================================================================
// Churchill Falls Assistant - OPTIMIZED Backend
// ============================================================================
// Voice Mode: Dr. Doug May's analysis only (FAST & AUTHENTIC)
// Text Mode: Full comprehensive research (all 36 docs via MCP)
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir));


// ============================================================================
// RESPONSE CACHE SYSTEM (Optimization 2)
// ============================================================================

const responseCache = new Map();
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

function getCacheKey(message, mode) {
    // Create a simple hash of the message + mode
    const normalized = message.toLowerCase().trim();
    return `${mode}:${normalized}`;
}

function getCachedResponse(message, mode) {
    const key = getCacheKey(message, mode);
    const cached = responseCache.get(key);
    
    if (!cached) return null;
    
    // Check if cache is still valid (within CACHE_DURATION)
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_DURATION) {
        responseCache.delete(key);
        return null;
    }
    
    console.log(`💾 Cache HIT! (age: ${Math.round(age / 1000)}s)`);
    return cached.response;
}

function cacheResponse(message, mode, response) {
    const key = getCacheKey(message, mode);
    responseCache.set(key, {
        response,
        timestamp: Date.now(),
        mode
    });
    console.log(`💾 Cached response (total cached: ${responseCache.size})`);
}

// Periodically clean expired cache entries
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of responseCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            responseCache.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
    }
}, 600000); // Clean every 10 minutes

// ============================================================================
// API SETUP
// ============================================================================

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ELEVENLABS_VOICE_ID_FR = process.env.ELEVENLABS_VOICE_ID_FR; // French voice

let monthlyVoiceUsage = 0;
const MONTHLY_VOICE_LIMIT = 500000;

console.log('\n' + '='.repeat(60));
console.log('🚀 Churchill Falls Assistant - OPTIMIZED');
console.log('   Voice: Dr. Doug May\'s Analysis Only');
console.log('   Text: Comprehensive (All Sources)');
console.log('='.repeat(60));

// ============================================================================
// DOUG'S CORE DOCUMENTS - SUMMARIES (Voice Mode Only - OPTIMIZED!)
// Using concise summaries instead of full documents for faster responses
// ============================================================================

const DOUG_DOCUMENTS = [
    // Core MOU and Analysis (summaries)
    'MOU_Churchill_Falls_Dec_12_2024_summary.txt',
    'Doug-video-series-video1-summary.txt',
    'Doug-video-series-video2A-summary.txt',
    'Doug-video-series-video2B-summary.txt',
    'LOCKE analysis of MOU CF-summary.txt',
    
    // Doug's Complete Analysis Collection (17 files total)
    'doug-may-assessment-of-proposed-prices-mou.txt',
    'doug-may-CF-assessment-mou.txt',
    'doug-point-summary-assessment-mou-prices.txt',
    'Doug-Proposed_Prices_Under-MOU.txt',
    'Doug-Proposed_Projects_Under-mou.txt',
    'doug-summary-video.txt',
    'HYDRO-QUEBECS-EXPORTS.txt',
    'HYDRO-QUEBECS-IMPORTS.txt',
    'quebecs-electricity-supply-problem.txt',
    'Proposed-Prices-for-Existing-Power.txt',
    'Understanding-Some-Financial-Concep.txt'
];

const dougDocuments = new Map();

function loadDougDocuments() {
    console.log('\n📚 Loading Dr. Doug May\'s analysis SUMMARIES for voice mode...');
    console.log('   (Using optimized summaries for faster responses)');
    
    const contentDir = path.join(__dirname, 'content');
    let loadedCount = 0;
    let totalSize = 0;
    
    for (const filename of DOUG_DOCUMENTS) {
        const filepath = path.join(contentDir, filename);
        
        try {
            if (fs.existsSync(filepath)) {
                const content = fs.readFileSync(filepath, 'utf-8');
                dougDocuments.set(filename, content);
                totalSize += content.length;
                loadedCount++;
                const sizeKB = (content.length / 1024).toFixed(2);
                console.log(`  ✓ ${filename} (${sizeKB} KB)`);
            } else {
                console.log(`  ⚠ Not found: ${filename}`);
            }
        } catch (error) {
            console.error(`  ✗ Error loading ${filename}:`, error.message);
        }
    }
    
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    const estimatedTokens = Math.round(totalSize / 3.5);
    
    console.log(`\n✅ Loaded ${loadedCount}/${DOUG_DOCUMENTS.length} summary documents`);
    console.log(`   Size: ${totalSizeMB} MB (~${estimatedTokens.toLocaleString()} tokens)`);
    console.log(`   💡 93% smaller than full documents - faster & more efficient!`);
}

loadDougDocuments();

// ============================================================================
// MCP CLIENT (For Text Mode - All Documents)
// ============================================================================

let mcpClient = null;

async function initializeMCP() {
    console.log('\n🔌 Initializing MCP for comprehensive text mode...');
    
    try {
        const serverPath = path.join(__dirname, 'mcp-server-hybrid.js');
        
        if (!fs.existsSync(serverPath)) {
            console.error('❌ MCP server not found:', serverPath);
            return false;
        }

        const transport = new StdioClientTransport({
            command: 'node',
            args: [serverPath]
        });

        mcpClient = new Client({
            name: 'churchill-falls-client',
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        await mcpClient.connect(transport);
        
        const tools = await mcpClient.listTools();
        console.log(`✅ MCP connected: ${tools.tools.length} tools available`);
        
        return true;
    } catch (error) {
        console.error('❌ MCP initialization failed:', error.message);
        mcpClient = null;
        return false;
    }
}

initializeMCP();

// ============================================================================
// POST-PROCESSING (Clean up responses for voice)
// ============================================================================

// ============================================================================
// ACRONYM EXPANSION FOR VOICE
// ============================================================================

function expandAcronyms(text) {
    // First, handle currency and special symbols for voice
    text = text
        // Cent symbol
        .replace(/¢/g, ' cents')
        // Dollar amounts with cent symbol (e.g., "2.5¢" → "2.5 cents")
        .replace(/(\d+\.?\d*)\s*¢/g, '$1 cents')
        // Dollar symbol with numbers (keep as-is, will sound natural)
        // e.g., "$5" already sounds fine, but we can spell out if needed
        .replace(/\$(\d+)([BbMm])\b/g, '$$$1 $2') // Keep $5B, $10M format
    
    // Comprehensive Churchill Falls acronym dictionary
    const acronyms = {
        // Organizations
        'HQ': 'Hydro-Québec',
        'NLH': 'Newfoundland and Labrador Hydro',
        'GNL': 'Government of Newfoundland and Labrador',
        'CF(L)Co': 'Churchill Falls Labrador Corporation',
        'CFLCo': 'Churchill Falls Labrador Corporation',
        
        // Energy Units
        'kWh': 'kilowatt hours',
        'KWh': 'kilowatt hours',
        'kwh': 'kilowatt hours',
        'TWh': 'terawatt hours',
        'MWh': 'megawatt hours',
        'MW': 'megawatts',
        'GW': 'gigawatts',
        
        // Financial & Economic Terms
        'NPV': 'Net Present Value',
        'PV': 'Present Value',
        'GDP': 'Gross Domestic Product',
        'ROI': 'Return on Investment',
        
        // Contracts & Agreements
        'MOU': 'Memorandum of Understanding',
        'GWAC': 'Guaranteed Winter Availability Contract',
        'PPA': 'Power Purchase Agreement',
        
        // Geographic & Projects
        'NL': 'Newfoundland and Labrador',
        'QC': 'Quebec',
        'LIL': 'Labrador-Island Link',
        'ML': 'Maritime Link',
        
        // Technical Terms
        'AC': 'Alternating Current',
        'DC': 'Direct Current',
        'HVDC': 'High-Voltage Direct Current',
        
        // Time Periods
        'FY': 'Fiscal Year',
        'Q1': 'First Quarter',
        'Q2': 'Second Quarter',
        'Q3': 'Third Quarter',
        'Q4': 'Fourth Quarter'
    };
    
    // Replace each acronym with its full form
    // Use word boundaries to avoid partial replacements
    for (const [acronym, expansion] of Object.entries(acronyms)) {
        // Escape special regex characters in the acronym
        const escapedAcronym = acronym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedAcronym}\\b`, 'g');
        text = text.replace(regex, expansion);
    }
    
    return text;
}

function postProcessForVoice(text) {
    // 1. First expand acronyms
    text = expandAcronyms(text);
    
    // 2. Then add pauses at section breaks (double newline → triple newline = longer pause)
    text = text.replace(/\n\n/g, '\n\n\n');
    
    // 3. Make currency more voice-friendly
    text = text
        // "$5 million" → "5 million dollars"
        .replace(/\$(\d+(?:\.\d+)?)\s*(billion|million|thousand)/gi, '$1 $2 dollars')
        // "$5B" → "5 billion dollars"
        .replace(/\$(\d+(?:\.\d+)?)\s*([BbMm])\b/g, (match, num, unit) => {
            const unitMap = {'B': 'billion', 'b': 'billion', 'M': 'million', 'm': 'million'};
            return `${num} ${unitMap[unit]} dollars`;
        });
    
    // 4. Make percentages more natural
    text = text.replace(/(\d+(?:\.\d+)?)\s*%/g, '$1 percent');
    
    // 5. Handle large numbers with commas (e.g., "1,000" → "1 thousand")
    text = text.replace(/\b(\d{1,3}),(\d{3}),(\d{3}),(\d{3})\b/g, '$1 billion $2 million'); // billions
    text = text.replace(/\b(\d{1,3}),(\d{3}),(\d{3})\b/g, '$1 million $2 thousand'); // millions
    
    // 6. Expand common abbreviations
    text = text.replace(/\be\.g\./gi, 'for example');
    text = text.replace(/\bi\.e\./gi, 'that is');
    text = text.replace(/\betc\./gi, 'and so on');
    text = text.replace(/\bvs\./gi, 'versus');
    
    return text;
}

function cleanupVoiceText(text) {
    return text
        // Remove markdown headers
        .replace(/^#+\s+/gm, '')
        // Remove bold/italic markers
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        // Remove bullet points but keep the content
        .replace(/^\s*[-•]\s+/gm, '')
        // Clean up multiple spaces
        .replace(/  +/g, ' ')
        // Clean up multiple newlines but preserve intentional breaks
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const DOUG_VOICE_PROMPT = `You are Dr. Doug May having a casual conversation. Your response will be read aloud as audio.

CRITICAL BREVITY RULES:
- MAXIMUM 2-3 sentences TOTAL (40-60 words absolute max)
- ONE main point only
- No lists, no multiple topics
- If asked complex question, give ONE key takeaway

STRUCTURE for voice:
- Answer the question directly in 1-2 sentences
- Add ONE additional sentence if needed for context
- Stop immediately after that

CRITICAL: Every sentence must have a subject AND a verb. Never write fragments.

EXAMPLES:

Q: "What is Churchill Falls?"
A: "Churchill Falls is a massive hydroelectric facility in Labrador that generates 5,428 megawatts. It's been operating since 1971 under a controversial contract with Hydro-Québec."

Q: "What's the MOU about?"
A: "The 2024 MOU creates 50-50 revenue sharing between Newfoundland and Quebec when the original contract expires in 2041. However, critics argue the pricing undervalues the electricity."

Write in complete sentences. Keep it SHORT - maximum 3 sentences.`;

const TEXT_MODE_FAST_PROMPT = `You are an expert AI assistant specializing in the Churchill Falls power project.

Provide CONCISE, factual answers (2-3 paragraphs maximum, 150-250 words).

CRITICAL INSTRUCTIONS:
- Write in direct, factual third person voice
- Start with the direct answer immediately
- NEVER use: "Based on...", "According to...", "The analysis shows..."
- Just state the facts directly
- Include key dates, figures, and names
- Keep it brief but informative
- ALWAYS refer to Doug May as "Dr. Doug May" or "Dr. May"
- ALWAYS refer to Wade Locke as "Dr. Wade Locke" or "Dr. Locke"

Example of what NOT to do:
"Based on the comprehensive analysis of available documents, the Churchill Falls agreement is controversial..."

Example of what TO do:
"The Churchill Falls agreement is controversial for several interconnected reasons..."

Focus on the most essential information. If the user wants more detail, they can use Deep mode.`;

const TEXT_MODE_DEEP_PROMPT = `You are an expert AI assistant specializing in the Churchill Falls power project.

Provide comprehensive, well-researched answers using all available documents.

RESEARCH STRATEGY:
1. Use search_documents with max_results=10-15 to find ALL relevant documents
2. For key documents found, use get_document to retrieve full content
3. Synthesize information from MULTIPLE sources (aim for 5+ sources for complex questions)
4. Present diverse perspectives (Doug May's analysis, Wade Locke's critique, official documents, etc.)

CRITICAL INSTRUCTIONS:
- Write in direct, factual third person voice
- Start responses with the direct answer (e.g., "The Churchill Falls agreement is controversial because...")
- NEVER use: "Based on...", "According to...", "The analysis shows...", "Research indicates..."
- Just state the facts directly
- Include specific details, dates, and figures
- Present multiple perspectives (Doug May, Wade Locke, other economists)
- Structure responses with clear sections
- Provide thorough analysis with supporting evidence
- ALWAYS refer to Doug May as "Dr. Doug May" or "Dr. May"
- ALWAYS refer to Wade Locke as "Dr. Wade Locke" or "Dr. Locke"

WHEN ANSWERING ABOUT DOUG MAY'S ANALYSIS:
- Search for: "Doug video" or "Doug May analysis"
- Retrieve ALL Doug video transcripts (video1, 2A, 2B, 3A, 3B, 4)
- Synthesize his complete perspective across all videos
- Include his economic frameworks, cost comparisons, and strategic analysis

Example of what NOT to do:
"Based on the comprehensive analysis of available documents, the Churchill Falls agreement is controversial..."

Example of what TO do:
"The Churchill Falls agreement is controversial for several interconnected reasons..."

Provide objective research presented as established facts, not as someone's analysis.`;

// ============================================================================
// FRENCH SYSTEM PROMPTS (Automatic Language Detection)
// ============================================================================

const DOUG_VOICE_PROMPT_FR = `Vous êtes le Dr Doug May en conversation informelle. Votre réponse sera lue à voix haute.

RÈGLES CRITIQUES DE BRIÈVETÉ:
- MAXIMUM 2-3 phrases TOTALES (40-60 mots maximum absolu)
- UN seul point principal
- Pas de listes, pas de sujets multiples
- Si question complexe, donnez UN point clé

STRUCTURE pour la voix:
- Répondez directement à la question en 1-2 phrases
- Ajoutez UNE phrase supplémentaire si nécessaire pour le contexte
- Arrêtez immédiatement après

CRITIQUE: Chaque phrase doit avoir un sujet ET un verbe. N'écrivez jamais de fragments.

EXEMPLES:

Q: "Qu'est-ce que Churchill Falls?"
A: "Churchill Falls est une installation hydroélectrique massive au Labrador qui génère 5 428 mégawatts. Elle fonctionne depuis 1971 sous un contrat controversé avec Hydro-Québec."

Q: "De quoi parle le PE?"
A: "Le PE de 2024 crée un partage de revenus 50-50 entre Terre-Neuve et le Québec lorsque le contrat original expire en 2041. Cependant, les critiques soutiennent que le prix sous-évalue l'électricité."

Écrivez en phrases complètes. Restez BREF - maximum 3 phrases.`;

const TEXT_MODE_FAST_PROMPT_FR = `Vous êtes un assistant IA expert spécialisé dans le projet hydroélectrique de Churchill Falls.

Fournissez des réponses CONCISES et factuelles (2-3 paragraphes maximum, 150-250 mots).

INSTRUCTIONS CRITIQUES:
- Écrivez à la troisième personne de façon directe et factuelle
- Commencez par la réponse directe immédiatement
- N'UTILISEZ JAMAIS: "Selon...", "D'après...", "L'analyse montre..."
- Énoncez simplement les faits directement
- Incluez les dates clés, les chiffres et les noms
- Restez bref mais informatif
- Référez-vous TOUJOURS à Doug May comme "Dr Doug May" ou "Dr May"
- Référez-vous TOUJOURS à Wade Locke comme "Dr Wade Locke" ou "Dr Locke"

Exemple de ce qu'il NE FAUT PAS faire:
"Selon l'analyse complète des documents disponibles, l'entente de Churchill Falls est controversée..."

Exemple de ce qu'il FAUT faire:
"L'entente de Churchill Falls est controversée pour plusieurs raisons interconnectées..."

Concentrez-vous sur l'information la plus essentielle. Si l'utilisateur veut plus de détails, il peut utiliser le mode Deep.`;

const TEXT_MODE_DEEP_PROMPT_FR = `Vous êtes un assistant IA expert spécialisé dans le projet hydroélectrique de Churchill Falls.

Fournissez des réponses complètes et bien documentées en utilisant tous les documents disponibles.

STRATÉGIE DE RECHERCHE:
1. Utilisez search_documents avec max_results=10-15 pour trouver TOUS les documents pertinents
2. Pour les documents clés trouvés, utilisez get_document pour récupérer le contenu complet
3. Synthétisez l'information de MULTIPLES sources (visez 5+ sources pour les questions complexes)
4. Présentez diverses perspectives (analyse de Doug May, critique de Wade Locke, documents officiels, etc.)

INSTRUCTIONS CRITIQUES:
- Écrivez à la troisième personne de façon directe et factuelle
- Commencez les réponses par la réponse directe (par exemple, "L'entente de Churchill Falls est controversée parce que...")
- N'UTILISEZ JAMAIS: "Selon...", "D'après...", "L'analyse montre...", "La recherche indique..."
- Énoncez simplement les faits directement
- Incluez des détails spécifiques, dates et chiffres
- Présentez plusieurs perspectives (Doug May, Wade Locke, autres économistes)
- Structurez les réponses avec des sections claires
- Fournissez une analyse approfondie avec des preuves à l'appui
- Référez-vous TOUJOURS à Doug May comme "Dr Doug May" ou "Dr May"
- Référez-vous TOUJOURS à Wade Locke comme "Dr Wade Locke" ou "Dr Locke"

Fournissez une recherche objective présentée comme des faits établis, pas comme l'analyse de quelqu'un.`;

// ============================================================================
// LANGUAGE DETECTION - IMPROVED
// ============================================================================

function detectLanguage(text) {
    const textLower = text.toLowerCase();
    
    // French indicators - including variations without accents
    const frenchIndicators = [
        // Full words
        'québec', 'quebec', 'qu\'est-ce', 'qu\'est', 'quelle', 'quel', 'quels', 'quelles',
        'comment', 'pourquoi', 'électricité', 'electricite', 'entente', 'protocole',
        'combien', 'où', 'ou', 'quand', 'est-ce que', 'parle', 'parlez',
        'explique', 'expliquez', 'dis', 'dites', 'peux-tu', 'pouvez-vous',
        'hydro-québec', 'hydro-quebec', 'terre-neuve', 'labrador',
        // Partial matches for speech recognition
        'francais', 'français', 'franca', 'franc ',
        'en francais', 'on francais', 'on franca', 'en franca'
    ];
    
    // Count French indicators
    let frenchCount = 0;
    for (const indicator of frenchIndicators) {
        if (textLower.includes(indicator)) {
            frenchCount++;
        }
    }
    
    // If we find 1 or more French indicators, it's likely French
    // Lowered threshold from 2 to 1 to catch more cases
    const detectedLang = frenchCount >= 1 ? 'fr' : 'en';
    
    if (detectedLang === 'fr') {
        console.log(`🇫🇷 French detected (${frenchCount} indicators)`);
    }
    
    return detectedLang;
}


// ============================================================================
// MAIN CHAT ENDPOINT
// ============================================================================

app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { 
            message, 
            conversationHistory = [], 
            isVoiceMode = false,
            textMode = 'deep', // 'fast' or 'deep' for text responses
            voicePreference = 'auto' // TESTING ONLY: 'auto', 'doug', or 'french'
        } = req.body;
        
        if (!message?.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        // Detect language from user's message
        const language = detectLanguage(message);
        
        // Determine mode label for logging
        let modeLabel = '📝 TEXT';
        if (isVoiceMode) {
            modeLabel = `🎤 VOICE (Doug) [${language.toUpperCase()}]`;
        } else {
            modeLabel = `${textMode === 'fast' ? '⚡ FAST TEXT' : '🔍 DEEP TEXT'} [${language.toUpperCase()}]`;
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`${modeLabel}: "${message.substring(0, 50)}..."`);
        console.log(`${'='.repeat(60)}`);
        
        // ============================================================================
        // CHECK CACHE FIRST (Optimization 2)
        // ============================================================================
        
        const cacheMode = isVoiceMode ? 'voice' : `text-${textMode}`;
        const cachedResponse = getCachedResponse(message, cacheMode);
        
        if (cachedResponse) {
            const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ Returned cached response: ${cachedResponse.text?.length || 0} chars`);
            console.log(`⏱️ Cache response time: ${responseTime}s (INSTANT!)`);
            console.log(`${'='.repeat(60)}`);
            
            // Return cached response with updated timestamp
            return res.json({
                ...cachedResponse,
                cached: true,
                responseTime: parseFloat(responseTime)
            });
        }
        
        console.log(`🔍 No cache - generating new response...`);
        
        // ============================================================================
        // GENERATE NEW RESPONSE
        // ============================================================================
        
        const messages = [
            ...conversationHistory,
            { role: 'user', content: message }
        ];
        
        let responseText = '';
        let audioData = null;
        let documentsAccessed = new Set(); // Track which documents were used (for text mode)
        
        // ====================================================================
        // VOICE MODE - Doug May's Analysis
        // ====================================================================
        
        if (isVoiceMode) {
            console.log('📚 Using Doug\'s analysis (17 documents)...');
            
            // Build context from Doug's documents
            let documentContext = '# Dr. Doug May\'s Analysis and Source Materials\n\n';
            
            for (const [filename, content] of dougDocuments.entries()) {
                documentContext += `## ${filename}\n${content}\n\n---\n\n`;
            }
            
            // Select prompt based on detected language
            const basePrompt = language === 'fr' ? DOUG_VOICE_PROMPT_FR : DOUG_VOICE_PROMPT;
            const systemPrompt = basePrompt + '\n\n' + documentContext;
            
            const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 400, // Reduced from 500 to force brevity
                system: systemPrompt,
                messages: messages
            });
            
            responseText = response.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');
            
            console.log(`✅ Response generated: ${responseText.length} chars`);
            
            // Post-process for voice (acronym expansion, cleanup, etc.)
            const processedText = postProcessForVoice(responseText);
            const cleanedText = cleanupVoiceText(processedText);
            
            console.log(`🎯 After post-processing: ${cleanedText.length} chars`);
            
            responseText = cleanedText; // Use the cleaned version
            
            // ========== TESTING ONLY: Voice Selection Override ==========
            // TO REVERT: Delete this entire section and uncomment the line below
            let voiceId;
            if (voicePreference === 'doug') {
                voiceId = ELEVENLABS_VOICE_ID; // Always use Doug's voice
            } else if (voicePreference === 'french') {
                voiceId = ELEVENLABS_VOICE_ID_FR || ELEVENLABS_VOICE_ID; // French voice or fallback
            } else {
                // Auto mode - use language detection (original behavior)
                voiceId = language === 'fr' && ELEVENLABS_VOICE_ID_FR ? ELEVENLABS_VOICE_ID_FR : ELEVENLABS_VOICE_ID;
            }
            // TO REVERT TO AUTO MODE, UNCOMMENT THIS LINE AND DELETE THE ABOVE:
            // const voiceId = language === 'fr' && ELEVENLABS_VOICE_ID_FR ? ELEVENLABS_VOICE_ID_FR : ELEVENLABS_VOICE_ID;
            // ========== END TESTING SECTION ==========
            
            // Generate audio if available
            if (ELEVENLABS_API_KEY && voiceId) {
                try {
                    console.log(`🔊 Generating audio in ${language === 'fr' ? 'French' : 'English'}...`);
                    
                    const elevenLabsResponse = await axios.post(
                        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                        {
                            text: cleanedText,
                            model_id: 'eleven_multilingual_v2',
                            voice_settings: {
                                stability: 0.5,
                                similarity_boost: 0.75
                            }
                        },
                        {
                            headers: {
                                'xi-api-key': ELEVENLABS_API_KEY,
                                'Content-Type': 'application/json'
                            },
                            responseType: 'arraybuffer'
                        }
                    );
                    
                    audioData = Buffer.from(elevenLabsResponse.data).toString('base64');
                    monthlyVoiceUsage += cleanedText.length;
                    
                    console.log(`✅ Audio generated (${cleanedText.length} chars)`);
                    console.log(`   Monthly usage: ${monthlyVoiceUsage}/${MONTHLY_VOICE_LIMIT}`);
                } catch (audioError) {
                    console.error('⚠️  Audio generation failed:', audioError.message);
                }
            }
        }
        
        // ====================================================================
        // TEXT MODE - MCP Research
        // ====================================================================
        
        else {
            if (!mcpClient) {
                console.log('⚠️  MCP not connected - cannot provide text response');
                return res.status(500).json({ 
                    error: 'Text mode temporarily unavailable. Please try voice mode.',
                    text: 'Text mode requires MCP connection. Please try voice mode instead.'
                });
            }

            const isFastMode = textMode === 'fast';
            console.log(`📚 Using MCP for ${isFastMode ? 'quick' : 'comprehensive'} research...`);

            const tools = await mcpClient.listTools();
            const toolsList = tools.tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema
            }));

            // Select prompt based on detected language and mode
            let systemPrompt;
            if (language === 'fr') {
                systemPrompt = isFastMode ? TEXT_MODE_FAST_PROMPT_FR : TEXT_MODE_DEEP_PROMPT_FR;
            } else {
                systemPrompt = isFastMode ? TEXT_MODE_FAST_PROMPT : TEXT_MODE_DEEP_PROMPT;
            }
            
            const maxTokens = isFastMode ? 1024 : 4096; // Fast: ~250 words, Deep: ~1000 words

            let response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: messages,
                tools: toolsList
            });

            let currentMessages = [...messages];
            let toolCallCount = 0;
            const MAX_TOOL_CALLS = 10;
            // documentsAccessed is declared at top level

            // Handle tool use
            while (response.stop_reason === 'tool_use' && toolCallCount < MAX_TOOL_CALLS) {
                toolCallCount++;
                console.log(`🔧 Tool call ${toolCallCount}/${MAX_TOOL_CALLS}`);

                currentMessages.push({
                    role: 'assistant',
                    content: response.content
                });

                const toolResults = [];

                for (const block of response.content) {
                    if (block.type === 'tool_use') {
                        console.log(`  → ${block.name}`);
                        
                        // Enhanced logging - show the actual input structure
                        if (block.input) {
                            console.log(`  → Input keys:`, Object.keys(block.input));
                            console.log(`  → Full input:`, JSON.stringify(block.input, null, 2));
                        }
                        
                        // Track document access - try ALL possible field names
                        if (block.name === 'get_document') {
                            const possibleDocName = 
                                block.input.filename || 
                                block.input.document || 
                                block.input.name ||
                                block.input.file ||
                                block.input.path ||
                                block.input.uri ||
                                block.input.id;
                            
                            if (possibleDocName) {
                                documentsAccessed.add(possibleDocName);
                                console.log(`  ✓ Tracked document: ${possibleDocName}`);
                            } else {
                                console.log(`  ⚠ get_document called but no document name found in:`, block.input);
                            }
                        }
                        
                        try {
                            const result = await mcpClient.callTool({
                                name: block.name,
                                arguments: block.input
                            });

                            // ENHANCED SOURCE TRACKING
                            if (result && result.content && result.content[0]) {
                                const resultText = result.content[0].text || '';
                                
                                // For search_documents: Parse JSON and extract ALL filenames
                                if (block.name === 'search_documents') {
                                    try {
                                        const searchResults = JSON.parse(resultText);
                                        if (Array.isArray(searchResults)) {
                                            console.log(`  📚 Search returned ${searchResults.length} documents:`);
                                            searchResults.forEach(result => {
                                                if (result.filename) {
                                                    documentsAccessed.add(result.filename);
                                                    console.log(`     ✓ ${result.filename} (score: ${result.score})`);
                                                }
                                            });
                                        }
                                    } catch (e) {
                                        console.log(`  ⚠ Could not parse search results as JSON`);
                                    }
                                }
                                
                                // For get_document: Track the specific document requested
                                if (block.name === 'get_document' && block.input && block.input.filename) {
                                    documentsAccessed.add(block.input.filename);
                                    console.log(`  ✓ Retrieved: ${block.input.filename}`);
                                }
                                
                                console.log(`  → Total sources tracked: ${documentsAccessed.size}`);
                            }

                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: block.id,
                                content: result.content[0].text
                            });
                        } catch (error) {
                            console.error(`  ✗ ${block.name} error:`, error.message);
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: block.id,
                                content: `Error: ${error.message}`,
                                is_error: true
                            });
                        }
                    }
                }

                currentMessages.push({
                    role: 'user',
                    content: toolResults
                });

                response = await anthropic.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: maxTokens,
                    system: systemPrompt,
                    messages: currentMessages,
                    tools: toolsList
                });
            }

            responseText = response.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            const wordCount = responseText.split(/\s+/).length;
            console.log(`✅ Comprehensive response: ${wordCount} words`);
        }
        
        // ====================================================================
        // RESPONSE
        // ====================================================================
        
        const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`⏱️ Total time: ${responseTime}s`);
        console.log('='.repeat(60));
        
        const responseData = {
            text: responseText,
            audio: audioData,
            voiceAvailable: !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID),
            responseTime: parseFloat(responseTime),
            mode: isVoiceMode ? 'voice' : textMode, // 'voice', 'fast', or 'deep'
            cached: false
        };
        
        // Add sources for text mode (if documents were accessed via MCP)
        if (!isVoiceMode && typeof documentsAccessed !== 'undefined' && documentsAccessed.size > 0) {
            responseData.sources = Array.from(documentsAccessed);
            console.log(`📚 Sources used: ${documentsAccessed.size} documents`);
        }
        
        // ============================================================================
        // CACHE THE RESPONSE (Optimization 2)
        // ============================================================================
        
        cacheResponse(message, cacheMode, responseData);
        
        res.json(responseData);

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ 
            error: 'An error occurred processing your request',
            details: error.message 
        });
    }
});

// ============================================================================
// LEGACY ENDPOINT (For compatibility)
// ============================================================================

app.post('/api/voice-chat', async (req, res) => {
    // Convert old format to new format
    const { message, conversationHistory, requestVoice } = req.body;
    
    req.body = {
        message,
        conversationHistory,
        isVoiceMode: requestVoice
    };
    
    // Forward to main endpoint
    return app._router.handle(
        { ...req, url: '/api/chat', method: 'POST' },
        res,
        () => {}
    );
});

// ============================================================================
// STATUS ENDPOINTS
// ============================================================================

app.get('/api/voice-status', (req, res) => {
    const available = !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID);
    const frenchAvailable = !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID_FR);
    
    res.json({
        available,
        frenchAvailable,
        creditsUsed: monthlyVoiceUsage,
        monthlyLimit: MONTHLY_VOICE_LIMIT,
        percentUsed: ((monthlyVoiceUsage / MONTHLY_VOICE_LIMIT) * 100).toFixed(1),
        documentsLoaded: dougDocuments.size,
        mcpConnected: !!mcpClient
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        voiceMode: {
            documents: dougDocuments.size,
            totalDocs: DOUG_DOCUMENTS.length
        },
        textMode: {
            mcpConnected: !!mcpClient
        },
        cache: {
            entries: responseCache.size,
            maxAge: `${CACHE_DURATION / 60000} minutes`
        },
        timestamp: new Date().toISOString()
    });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('✅ Churchill Falls Assistant - Ready!');
    console.log('='.repeat(60));
    console.log(`🌐 Server running on port ${PORT}`);
    console.log(`\n📊 System Status:`);
    console.log(`   Voice Mode: ${dougDocuments.size}/${DOUG_DOCUMENTS.length} Doug's documents`);
    console.log(`   Text Mode: ${mcpClient ? 'MCP connected ✓' : 'MCP disconnected ✗'}`);
    console.log(`   ElevenLabs (EN): ${ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID ? 'Enabled ✓' : 'Disabled ✗'}`);
    console.log(`   ElevenLabs (FR): ${ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID_FR ? 'Enabled ✓' : 'Disabled ✗'}`);
    console.log(`   🇫🇷 French: Automatic language detection enabled`);
    console.log('\n' + '='.repeat(60));
});