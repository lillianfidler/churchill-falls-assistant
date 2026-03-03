// ============================================================================
// Churchill Falls Assistant - OPTIMIZED Backend
// ============================================================================
// Voice Mode: Dr. Doug May's analysis only (FAST & AUTHENTIC)
// Text Mode: Full comprehensive research (all 36 docs via MCP)
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
app.set('trust proxy', 1); // Trust Render's proxy for accurate rate limiting

app.use(cors({
    origin: [
        'https://churchillfalls.info',
        'https://www.churchillfalls.info',
        'http://localhost:3000', // for local testing
        'https://churchill-falls.onrender.com' // allow self
    ],
    credentials: true
}));
app.use(express.json({ limit: '1mb' }));
const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir));


// ============================================================================
// RATE LIMITING (Prevent Abuse & Control Costs)
// ============================================================================

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 20, // Limit each IP to 20 requests per hour
  message: {
    error: 'Too many requests',
    text: 'You have reached the hourly limit of 20 questions. Please wait before asking more questions.',
    voiceAvailable: false
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  // Skip rate limiting for health checks
  skip: (req) => req.path === '/api/health' || req.path === '/api/voice-status'
});

console.log('🛡️ Rate limiting enabled: 20 requests/hour per IP');


// ============================================================================
// RESPONSE CACHE SYSTEM (Optimization 2)
// ============================================================================

const responseCache = new Map();
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

function getCacheKey(message, mode) {
    // Create a simple hash of the message + mode
    const normalized = message.toLowerCase().trim().replace(/\s+/g, ' ');
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
    
    // Limit cache to 100 entries to prevent memory issues on Render's 512MB
    if (responseCache.size >= 100) {
        // Remove oldest entry
        const oldestKey = responseCache.keys().next().value;
        responseCache.delete(oldestKey);
        console.log(`💾 Cache full - evicted oldest entry`);
    }
    
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

const MONTHLY_VOICE_LIMIT = 500000;
const VOICE_USAGE_FILE = path.join(__dirname, '.voice-usage.json');

// Load voice usage from disk so the monthly limit survives server restarts
function loadVoiceUsage() {
    try {
        if (fs.existsSync(VOICE_USAGE_FILE)) {
            const data = JSON.parse(fs.readFileSync(VOICE_USAGE_FILE, 'utf-8'));
            const savedMonth = data.month || '';
            const currentMonth = new Date().toISOString().slice(0, 7); // "2026-03"
            if (savedMonth === currentMonth) {
                console.log(`📊 Voice usage loaded: ${data.usage}/${MONTHLY_VOICE_LIMIT} chars this month`);
                return data.usage || 0;
            }
            console.log('📊 New month — resetting voice usage counter');
        }
    } catch (e) {
        console.error('⚠️ Could not load voice usage:', e.message);
    }
    return 0;
}

function saveVoiceUsage(usage) {
    try {
        fs.writeFileSync(VOICE_USAGE_FILE, JSON.stringify({
            usage,
            month: new Date().toISOString().slice(0, 7),
            updatedAt: new Date().toISOString()
        }));
    } catch (e) {
        console.error('⚠️ Could not save voice usage:', e.message);
    }
}

let monthlyVoiceUsage = loadVoiceUsage();

console.log('\n' + '='.repeat(60));
console.log('🚀 Churchill Falls Assistant - OPTIMIZED');
console.log('   Voice: Dr. Doug May\'s Analysis Only');
console.log('   Text: Comprehensive (All Sources)');
console.log('='.repeat(60));

// ============================================================================
// USAGE STATISTICS TRACKING
// ============================================================================

const usageStats = {
    startedAt: new Date().toISOString(),
    totalQuestions: 0,
    byMode: { voice: 0, fast: 0, deep: 0 },
    byLanguage: { en: 0, fr: 0 },
    daily: {},   // { '2026-03-01': { total: 5, voice: 2, fast: 2, deep: 1 } }
    recentQuestions: [], // last 50 questions (no personal data, just metadata)
    totalResponseTime: 0,
    errors: 0,
    cacheHits: 0
};

function trackQuestion(mode, language, responseTime, cached) {
    const today = new Date().toISOString().split('T')[0];
    
    usageStats.totalQuestions++;
    usageStats.byMode[mode] = (usageStats.byMode[mode] || 0) + 1;
    usageStats.byLanguage[language] = (usageStats.byLanguage[language] || 0) + 1;
    usageStats.totalResponseTime += responseTime;
    if (cached) usageStats.cacheHits++;
    
    // Daily tracking
    if (!usageStats.daily[today]) {
        usageStats.daily[today] = { total: 0, voice: 0, fast: 0, deep: 0 };
    }
    usageStats.daily[today].total++;
    usageStats.daily[today][mode] = (usageStats.daily[today][mode] || 0) + 1;
    
    // Recent questions log (metadata only, no user content)
    usageStats.recentQuestions.push({
        time: new Date().toISOString(),
        mode,
        language,
        responseTime,
        cached
    });
    // Keep only last 100
    if (usageStats.recentQuestions.length > 100) {
        usageStats.recentQuestions = usageStats.recentQuestions.slice(-100);
    }
    
    // Clean up daily stats older than 90 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    for (const date of Object.keys(usageStats.daily)) {
        if (date < cutoffStr) delete usageStats.daily[date];
    }
}
// Using concise summaries instead of full documents for faster responses
// ============================================================================

// ============================================================================
// DYNAMIC DOUG DOCUMENT LOADING
// Automatically loads all files starting with "doug-may" (case-insensitive)
// No hardcoded list needed - just name files with doug-may prefix!
// ============================================================================

const dougDocuments = new Map();

function loadDougDocuments() {
    console.log('\n📚 Loading Dr. Doug May\'s analysis for voice mode...');
    console.log('   (Dynamically loading all files starting with "doug-may")');
    
    const contentDir = path.join(__dirname, 'content');
    let loadedCount = 0;
    let totalSize = 0;
    
    // Dynamically find all Doug May files (case-insensitive)
    let dougFiles = [];
    try {
        const allFiles = fs.readdirSync(contentDir);
        dougFiles = allFiles.filter(file => 
            file.toLowerCase().startsWith('doug-may') && 
            file.toLowerCase().endsWith('.txt')
        );
        console.log(`   Found ${dougFiles.length} Doug May documents`);
    } catch (err) {
        console.error('   ⚠️ Error reading content directory:', err.message);
        return;
    }
    
    for (const filename of dougFiles) {
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
    
    console.log(`\n✅ Loaded ${loadedCount}/${dougFiles.length} Doug May documents`);
    console.log(`   Size: ${totalSizeMB} MB (~${estimatedTokens.toLocaleString()} tokens)`);
    console.log(`   💡 93% smaller than full documents - faster & more efficient!`);
}

loadDougDocuments();

// ============================================================================
// MCP CLIENT (For Text Mode - All Documents)
// ============================================================================

let mcpClient = null;
let cachedToolsList = null; // Cache tools list since it doesn't change
let mcpReconnecting = false; // Prevent concurrent reconnection from spawning duplicate child processes

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
        cachedToolsList = tools.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema
        }));
        console.log(`✅ MCP connected: ${cachedToolsList.length} tools available (cached)`);
        
        return true;
    } catch (error) {
        console.error('❌ MCP initialization failed:', error.message);
        mcpClient = null;
        cachedToolsList = null;
        return false;
    }
}

// Auto-reconnect MCP if it drops — guarded so concurrent requests don't spawn duplicate processes
async function ensureMCP() {
    if (mcpClient && cachedToolsList) return true;
    if (mcpReconnecting) {
        console.log('🔄 MCP reconnection already in progress — waiting 3s...');
        await new Promise(r => setTimeout(r, 3000));
        return !!(mcpClient && cachedToolsList);
    }
    mcpReconnecting = true;
    console.log('🔄 MCP disconnected - attempting reconnection...');
    try {
        return await initializeMCP();
    } finally {
        mcpReconnecting = false;
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
    // 0. Fix local pronunciations
    text = text.replace(/Newfoundland/g, 'Noofenland');

    // 1. First expand acronyms
    text = expandAcronyms(text);
    
    // 2. Then add pauses at section breaks (double newline → triple newline = longer pause)
    //text = text.replace(/\n\n/g, '\n\n\n');
    
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
function truncateToCompleteSentence(text, maxChars = 650) {
    if (text.length <= maxChars) return text;
    
    const truncated = text.substring(0, maxChars);
    
    // Common abbreviations that should NOT be treated as sentence endings
    const abbreviations = ['Dr', 'Mr', 'Mrs', 'Ms', 'Prof', 'Sr', 'Jr', 'St', 'Gov', 'Gen', 'Rep', 'Sen', 'Rev', 'Vol', 'vs', 'etc', 'Inc', 'Ltd', 'Corp', 'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Find proper sentence endings
    let lastSentenceEnd = -1;
    
    for (let i = truncated.length - 1; i >= 0; i--) {
        const char = truncated[i];
        
        // Check if this is sentence-ending punctuation
        if (char === '.' || char === '!' || char === '?') {
            // Skip if preceded by digit (like "1." or "2.5")
            const prevChar = i > 0 ? truncated[i - 1] : '';
            if (/\d/.test(prevChar)) {
                continue;
            }
            
            // Skip single-letter abbreviations (U.S., U.K., e.g., i.e., etc.)
            // If preceded by a single letter, it's likely an abbreviation
            if (char === '.' && i > 0 && /[A-Za-z]/.test(prevChar)) {
                // Check if it's a single letter before the period
                const charBeforePrev = i > 1 ? truncated[i - 2] : ' ';
                if (/[\s.,;:(]/.test(charBeforePrev) || i === 1) {
                    continue; // Single letter + period = abbreviation (e.g., "U." in "U.S.")
                }
            }
            
            // Skip if this is an abbreviation (e.g., "Dr.", "Mr.", "St.")
            let isAbbreviation = false;
            if (char === '.') {
                for (const abbr of abbreviations) {
                    const start = i - abbr.length;
                    if (start >= 0) {
                        const candidate = truncated.substring(start, i);
                        if (candidate === abbr) {
                            // Also check it's a word boundary (start of string or preceded by space/punctuation)
                            if (start === 0 || /[\s,;:(]/.test(truncated[start - 1])) {
                                isAbbreviation = true;
                                break;
                            }
                        }
                    }
                }
            }
            if (isAbbreviation) continue;
            
            // Look ahead past any whitespace to find next non-whitespace character
            let nextNonWhitespace = '';
            for (let j = i + 1; j < truncated.length; j++) {
                if (!/\s/.test(truncated[j])) {
                    nextNonWhitespace = truncated[j];
                    break;
                }
            }
            
            // Valid if: end of string OR followed by whitespace then capital letter
            if (i === truncated.length - 1 || /[A-Z]/.test(nextNonWhitespace)) {
                lastSentenceEnd = i;
                break;
            }
        }
    }
    
    if (lastSentenceEnd > 0) {
        return text.substring(0, lastSentenceEnd + 1).trim();
    }
    
    // Fallback 1: Find last natural break point (comma, semicolon, colon, dash)
    let lastBreak = -1;
    for (let i = truncated.length - 1; i >= Math.floor(truncated.length * 0.5); i--) {
        if (truncated[i] === ',' || truncated[i] === ';' || truncated[i] === ':' || truncated[i] === '—' || truncated[i] === '-') {
            lastBreak = i;
            break;
        }
    }
    if (lastBreak > 0) {
        return text.substring(0, lastBreak).trim() + '...';
    }
    
    // Fallback 2: Never cut mid-word — find last space
    let lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
        return text.substring(0, lastSpace).trim() + '...';
    }
    
    return truncated.trim();
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const DOUG_VOICE_PROMPT = `You are Dr. Doug May having a casual conversation. Your response will be read aloud as audio.

CRITICAL RULES FOR VOICE:
- Write ONLY in natural spoken sentences as if talking to someone face-to-face
- NEVER use numbered lists, bullet points, headers, colons followed by lists, or any structured formatting
- NEVER use parenthetical abbreviations like "(Quebec)" or "(NL)"
- Maximum 4-5 sentences total, roughly 80-120 words
- For complex questions with multiple factors, pick the 2-3 most important points and weave them into flowing sentences
- Every response MUST end with a complete concluding sentence
- Speak naturally — use words like "and", "also", "another key factor is" to connect ideas

EXAMPLES:

Q: "What is Churchill Falls?"
A: "Churchill Falls is a massive hydroelectric facility in Labrador that generates 5,428 megawatts. It's been operating since 1971 under a controversial contract with Hydro-Québec."

Q: "What's the MOU about?"
A: "The 2024 MOU creates 50-50 revenue sharing between Newfoundland and Quebec when the original contract expires in 2041. However, critics argue the pricing undervalues the electricity."

Q: "Why are electricity prices in Quebec lower than in St. John's?"
A: "Quebec electricity prices are dramatically lower than St. John's, roughly 8 cents per kilowatt hour compared to about 15 cents. The main reason is that over 90 percent of Quebec's power comes from large-scale hydroelectric generation, which has very low ongoing costs. Meanwhile, Newfoundland ratepayers are bearing the cost of the Muskrat Falls project, which has significantly driven up electricity rates in the province."

Write in natural flowing speech. No lists. No structure. Just conversation.`;

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
- ALWAYS refer to Jim Feehan as "Dr. Jim Feehan" or "Dr. Feehan"

Example of what NOT to do:
"Based on the comprehensive analysis of available documents, the Churchill Falls agreement is controversial..."

Example of what TO do:
"The Churchill Falls agreement is controversial for several interconnected reasons..."

Focus on the most essential information. If the user wants more detail, they can use Deep mode.`;

const TEXT_MODE_DEEP_PROMPT = `You are an expert AI assistant specializing in the Churchill Falls power project.

Provide comprehensive, well-researched answers using all available documents.

RESEARCH STRATEGY:
1. Use search_documents with max_results=8 to find the most relevant documents
2. For the top 2-3 most relevant documents found, use get_document to retrieve full content
3. Synthesize information from multiple sources
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
- ALWAYS refer to Jim Feehan as "Dr. Jim Feehan" or "Dr. Feehan"

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

RÈGLES CRITIQUES POUR LA VOIX:
- Écrivez UNIQUEMENT en phrases naturelles parlées, comme si vous parliez à quelqu'un en face
- JAMAIS de listes numérotées, de puces, d'en-têtes, ou de deux-points suivis de listes
- JAMAIS d'abréviations entre parenthèses comme "(Québec)" ou "(T.-N.-L.)"
- Maximum 4-5 phrases au total, environ 80-120 mots
- Pour les questions complexes, choisissez les 2-3 points les plus importants et intégrez-les dans des phrases fluides
- Chaque réponse DOIT se terminer par une phrase de conclusion complète
- Parlez naturellement — utilisez des mots comme "et", "aussi", "un autre facteur important est" pour relier les idées

EXEMPLES:

Q: "Qu'est-ce que Churchill Falls?"
A: "Churchill Falls est une installation hydroélectrique massive au Labrador qui génère 5 428 mégawatts. Elle fonctionne depuis 1971 sous un contrat controversé avec Hydro-Québec."

Q: "De quoi parle le PE?"
A: "Le PE de 2024 crée un partage de revenus 50-50 entre Terre-Neuve et le Québec lorsque le contrat original expire en 2041. Cependant, les critiques soutiennent que le prix sous-évalue l'électricité."

Écrivez en langage parlé naturel et fluide. Pas de listes. Pas de structure. Juste de la conversation.`;

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
1. Utilisez search_documents avec max_results=8 pour trouver les documents les plus pertinents
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
// PRE-BUILT VOICE SYSTEM PROMPTS
// Built once at startup — avoids reconstructing ~150KB string on every voice request
// ============================================================================

let voiceSystemPromptEN = '';
let voiceSystemPromptFR = '';

function buildVoiceSystemPrompts() {
    let documentContext = '# Dr. Doug May\'s Analysis and Source Materials\n\n';
    for (const [filename, content] of dougDocuments.entries()) {
        documentContext += `## ${filename}\n${content}\n\n---\n\n`;
    }
    voiceSystemPromptEN = DOUG_VOICE_PROMPT + '\n\n' + documentContext;
    voiceSystemPromptFR = DOUG_VOICE_PROMPT_FR + '\n\n' + documentContext;
    const sizeKB = Math.round(voiceSystemPromptEN.length / 1024);
    console.log(`✅ Voice system prompts pre-built (${sizeKB}KB — built once, reused per request)`);
}

buildVoiceSystemPrompts();

// ============================================================================
// LANGUAGE DETECTION - IMPROVED
// ============================================================================

function detectLanguage(text) {
    const textLower = text.toLowerCase();
    
    // French grammar/sentence indicators ONLY
    // Excludes proper nouns (Quebec, Hydro-Quebec, Labrador, etc.) 
    // that appear constantly in English questions about Churchill Falls
    // Also excludes short words that could match inside English words
    const frenchIndicators = [
        // French question words & grammar (uniquely French)
        'qu\'est-ce', 'qu\'est', 'quelle', 'quel ', 'quels', 'quelles',
        'pourquoi', 'combien', 'est-ce que', 'peux-tu', 'pouvez-vous',
        // French verbs & commands
        'parlez', 'expliquez', 'dites-moi',
        // French-specific vocabulary (not proper nouns)
        'électricité', 'electricite', 'entente', 'protocole',
        // Explicit French language requests
        'en francais', 'en français',
        'on francais', 'on franca', 'en franca',
        // Multi-word French phrases (high confidence)
        'je veux', 'je voudrais', 'il y a', 'ce que', 'est-ce',
        'de la', 'c\'est', 'n\'est', 'qu\'il', 'qu\'elle'
    ];
    
    // Count French indicators
    let frenchCount = 0;
    for (const indicator of frenchIndicators) {
        if (textLower.includes(indicator)) {
            frenchCount++;
        }
    }
    
    // Need at least 2 French grammar indicators to confirm French
    const detectedLang = frenchCount >= 2 ? 'fr' : 'en';
    
    if (detectedLang === 'fr') {
        console.log(`🇫🇷 French detected (${frenchCount} indicators)`);
    }
    
    return detectedLang;
}


// ============================================================================
// MAIN CHAT ENDPOINT
// ============================================================================

async function handleChatRequest(req, res) {
    const startTime = Date.now();

    // Overall request timeout — deep text queries can legitimately take 27-30s on this server,
    // so we use 55s to give them room while still catching genuinely stalled requests.
    let responded = false;
    const requestTimeoutHandle = setTimeout(() => {
        if (!responded && !res.headersSent) {
            responded = true;
            console.error('⚠️ Request timeout (55s) — sending timeout response');
            usageStats.errors++;
            res.status(503).json({ error: 'Request timed out. Please try again.' });
        }
    }, 55000);

    try {
        const { 
            message, 
            conversationHistory = [], 
            isVoiceMode = false,
            textMode = 'deep' // 'fast' or 'deep' for text responses
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
            
            // Track cached response
            const cachedMode = isVoiceMode ? 'voice' : textMode;
            trackQuestion(cachedMode, language, parseFloat(responseTime), true);
            
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
        
        // Validate and sanitize conversation history (prevent oversized payloads driving up API costs)
        const MAX_HISTORY_MSG_LENGTH = 4000;
        const safeHistory = (conversationHistory || [])
            .slice(-20)
            .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map(m => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_MSG_LENGTH) }));

        const messages = [
            ...safeHistory,
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
            
            // Use pre-built system prompt (built once at startup, not rebuilt per-request)
            const systemPrompt = language === 'fr' ? voiceSystemPromptFR : voiceSystemPromptEN;
            
            const response = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001', // Haiku: 1/3 cost of Sonnet, faster, plenty smart for voice summaries
                max_tokens: 500, // Generate full thought, then truncate to complete sentences after
                system: [
                    {
                        type: 'text',
                        text: systemPrompt,
                        cache_control: { type: 'ephemeral' } // Cache the large system prompt (17 docs) — 90% savings on repeated requests
                    }
                ],
                messages: messages
            });
            
            responseText = response.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');
            
            console.log(`✅ Response generated: ${responseText.length} chars`);
            
            // Post-process for voice (acronym expansion, cleanup, etc.)
const displayText = cleanupVoiceText(responseText); // Clean for display, original spelling
const processedText = postProcessForVoice(responseText); // Pronunciation changes for audio only
const cleanedText = cleanupVoiceText(processedText);
const truncatedText = truncateToCompleteSentence(cleanedText, 1200);
console.log(`🎯 After post-processing: ${cleanedText.length} chars → ${truncatedText.length} chars`);
responseText = displayText; // Display uses original spelling
            
            // Select voice based on language
            const voiceId = ELEVENLABS_VOICE_ID; // Always use Doug's voice for both languages
            
            // Generate audio if available
            if (ELEVENLABS_API_KEY && voiceId) {
                try {
                    console.log(`🔊 Generating audio in ${language === 'fr' ? 'French' : 'English'}...`);
                    
                    const elevenLabsResponse = await axios.post(
                        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                        {
                            text: truncatedText,
                            model_id: 'eleven_multilingual_v2', // Required for French bilingual support
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
                            responseType: 'arraybuffer',
                            timeout: 30000 // 30 second timeout
                        }
                    );
                    
                    audioData = Buffer.from(elevenLabsResponse.data).toString('base64');
                    monthlyVoiceUsage += truncatedText.length; // track chars actually sent to ElevenLabs
                    saveVoiceUsage(monthlyVoiceUsage); // persist across server restarts

                    console.log(`✅ Audio generated (${truncatedText.length} chars)`);
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
            // Try to reconnect MCP if it's down
            if (!mcpClient || !cachedToolsList) {
                await ensureMCP();
            }
            
            if (!mcpClient || !cachedToolsList) {
                console.log('⚠️  MCP not connected - cannot provide text response');
                return res.status(500).json({ 
                    error: 'Text mode temporarily unavailable. Please try voice mode.',
                    text: 'Text mode requires MCP connection. Please try voice mode instead.'
                });
            }

            const isFastMode = textMode === 'fast';
            console.log(`📚 Using MCP for ${isFastMode ? 'quick' : 'comprehensive'} research...`);

            const toolsList = cachedToolsList;

            // Select prompt based on detected language and mode
            let systemPrompt;
            if (language === 'fr') {
                systemPrompt = isFastMode ? TEXT_MODE_FAST_PROMPT_FR : TEXT_MODE_DEEP_PROMPT_FR;
            } else {
                systemPrompt = isFastMode ? TEXT_MODE_FAST_PROMPT : TEXT_MODE_DEEP_PROMPT;
            }
            
            const maxTokens = isFastMode ? 1024 : 4096; // Fast: ~250 words, Deep: ~1000 words
            
            // Haiku for Fast (cheap + fast), Sonnet for Deep (quality matters)
            const textModel = isFastMode ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-20250514';
            console.log(`🤖 Model: ${textModel}`);

            let response = await anthropic.messages.create({
                model: textModel,
                max_tokens: maxTokens,
                system: [
                    {
                        type: 'text',
                        text: systemPrompt,
                        cache_control: { type: 'ephemeral' } // Cache system prompt — 90% savings on repeated requests
                    }
                ],
                messages: messages,
                tools: toolsList
            });

            let currentMessages = [...messages];
            let toolCallCount = 0;
            const MAX_TOOL_CALLS = isFastMode ? 3 : 5; // Fast: 3 max, Deep: 5 max (diminishing returns after 5)
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
                        
                        // Log input keys only (avoid JSON.stringify of full content under load)
                        if (block.input) {
                            console.log(`  → Input keys:`, Object.keys(block.input));
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

                            // If MCP disconnected, trigger reconnect and bail out of the tool loop.
                            // We can't continue: toolsList is stale and the new client is not set up yet.
                            // A partial/empty response is better than corrupted tool calls.
                            if (error.message.includes('closed') || error.message.includes('disconnected')) {
                                console.log('🔄 MCP appears disconnected — breaking tool loop, scheduling reconnect...');
                                mcpClient = null;
                                cachedToolsList = null;
                                ensureMCP(); // reconnect in background; don't await (we need to return now)
                                break; // exit the for loop over blocks
                            }

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
                    model: textModel, // Same model as initial call (Haiku for Fast, Sonnet for Deep)
                    max_tokens: maxTokens,
                    system: [
                        {
                            type: 'text',
                            text: systemPrompt,
                            cache_control: { type: 'ephemeral' } // Cache system prompt across tool loop iterations
                        }
                    ],
                    messages: currentMessages,
                    tools: toolsList
                });
            }

            responseText = response.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            // Fallback if MCP disconnect caused the tool loop to exit with no text content
            if (!responseText.trim()) {
                responseText = 'The research service encountered a connection issue. Please try again in a moment.';
                console.log('⚠️ Empty response after tool loop — MCP likely disconnected mid-request');
            }

            const wordCount = responseText.split(/\s+/).length;
            console.log(`✅ Comprehensive response: ${wordCount} words`);
            console.log(`💰 Tool calls: ${toolCallCount}/${MAX_TOOL_CALLS} (cached system prompt)`);
        }
        
        // ====================================================================
        // RESPONSE
        // ====================================================================
        
        const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`⏱️ Total time: ${responseTime}s`);
        
        // Cost estimation logging
        const model = isVoiceMode ? 'haiku-4.5' : (textMode === 'fast' ? 'haiku-4.5' : 'sonnet-4');
        console.log(`💰 Model used: ${model} | Mode: ${isVoiceMode ? 'voice' : textMode}`);
        console.log('='.repeat(60));
        
        const responseData = {
            text: responseText,
            audio: audioData,
            voiceAvailable: !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID),
            responseTime: parseFloat(responseTime),
            mode: isVoiceMode ? 'voice' : textMode, // 'voice', 'fast', or 'deep'
            cached: false
        };
        
        // Add sources
        if (isVoiceMode) {
            // Voice mode - don't show sources (always Doug May's complete analysis)
            // Listing all 22 files isn't helpful - users know it's Doug's analysis
            console.log(`📚 Used: ${dougDocuments.size} Doug May documents (complete analysis)`);
        } else if (typeof documentsAccessed !== 'undefined' && documentsAccessed.size > 0) {
            // Text mode - include MCP accessed documents
            responseData.sources = Array.from(documentsAccessed);
            console.log(`📚 Sources used: ${documentsAccessed.size} documents`);
        }
        
        // ============================================================================
        // CACHE THE RESPONSE (Optimization 2)
        // ============================================================================
        
        // Don't cache voice responses when audio failed — prevents serving a silent response
        // for up to an hour while ElevenLabs is down and then recovers
        if (!isVoiceMode || audioData !== null) {
            cacheResponse(message, cacheMode, responseData);
        }
        
        // Track new response
        const trackedMode = isVoiceMode ? 'voice' : textMode;
        trackQuestion(trackedMode, language, parseFloat(responseTime), false);
        
        if (!responded && !res.headersSent) {
            responded = true;
            res.json(responseData);
        }

    } catch (error) {
        console.error('❌ Error:', error.stack || error.message); // full stack in server logs
        usageStats.errors++;
        if (!res.headersSent) { // timeout may have already responded
            res.status(500).json({ error: 'An error occurred processing your request' });
        }
    } finally {
        clearTimeout(requestTimeoutHandle);
    }
}

app.post('/api/chat', chatLimiter, handleChatRequest);

// ============================================================================
// LEGACY ENDPOINT (For compatibility)
// ============================================================================

app.post('/api/voice-chat', chatLimiter, async (req, res) => {
    // Legacy endpoint — translate old field names to current format, then call the same handler
    const { message, conversationHistory, requestVoice } = req.body;
    req.body = { message, conversationHistory, isVoiceMode: requestVoice };
    return handleChatRequest(req, res);
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
            documents: dougDocuments.size
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
// USAGE STATISTICS ENDPOINT (Hidden dashboard)
// ============================================================================

app.get('/api/stats', (req, res) => {
    const statsKey = process.env.STATS_KEY;
    if (statsKey && req.query.key !== statsKey) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const avgResponseTime = usageStats.totalQuestions > 0
        ? (usageStats.totalResponseTime / usageStats.totalQuestions).toFixed(1) 
        : 0;
    
    res.json({
        uptime: usageStats.startedAt,
        summary: {
            totalQuestions: usageStats.totalQuestions,
            avgResponseTime: parseFloat(avgResponseTime),
            cacheHitRate: usageStats.totalQuestions > 0 
                ? ((usageStats.cacheHits / usageStats.totalQuestions) * 100).toFixed(1) + '%'
                : '0%',
            errors: usageStats.errors
        },
        byMode: usageStats.byMode,
        byLanguage: usageStats.byLanguage,
        daily: usageStats.daily,
        recentQuestions: usageStats.recentQuestions.slice(-20),
        voice: {
            creditsUsed: monthlyVoiceUsage,
            monthlyLimit: MONTHLY_VOICE_LIMIT,
            percentUsed: ((monthlyVoiceUsage / MONTHLY_VOICE_LIMIT) * 100).toFixed(1) + '%'
        },
        system: {
            documentsLoaded: dougDocuments.size,
            mcpConnected: !!mcpClient,
            cacheEntries: responseCache.size
        }
    });
});

// ============================================================================
// CRASH PREVENTION
// ============================================================================

process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught Exception:', error.stack || error.message);
    // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason);
    // Don't exit - keep server running
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
    console.log(`   Voice Mode: ${dougDocuments.size} Doug's documents loaded`);
    console.log(`   Text Mode: ${mcpClient ? 'MCP connected ✓' : 'MCP disconnected ✗'}`);
    console.log(`   ElevenLabs (EN): ${ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID ? 'Enabled ✓' : 'Disabled ✗'}`);
    console.log(`   ElevenLabs (FR): ${ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID_FR ? 'Enabled ✓' : 'Disabled ✗'}`);
    console.log(`   🇫🇷 French: Automatic language detection enabled`);
    console.log('\n' + '='.repeat(60));
});