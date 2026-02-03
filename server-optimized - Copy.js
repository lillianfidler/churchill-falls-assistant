#!/usr/bin/env node

/**
 * Churchill Falls Information Assistant - Express Server (Optimized for Voice)
 * Loads core documents directly into server context for fast voice responses
 * Connects to MCP server for supplementary historical documents
 * NOW WITH BILINGUAL SUPPORT (English/French)
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const Anthropic = require('@anthropic-ai/sdk');
const ElevenLabs = require("elevenlabs-node");

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize ElevenLabs client (ORIGINAL WORKING CODE)
const voice = new ElevenLabs({
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID,
});

// Document directory
const CONTENT_DIR = path.join(__dirname, 'content');

// CORE DOCUMENTS for Doug's voice mode (18 documents)
const DOUG_DOCUMENTS = [
    // Core MOU summary
    'MOU_Churchill_Falls_Dec_12_2024_summary.txt',
    
    // Doug May Video Series (all summaries)
    'Doug-video-series-video1-summary.txt',
    'Doug-video-series-video2A-summary.txt',
    'Doug-video-series-video2B-summary.txt',
    'Doug-video-series-video3A-summary.txt',
    'Doug-video-series-video3B-summary.txt',
    'Doug-video-series-video4-summary.txt',
    
    // Doug May NEW MOU Analysis (January 2026)
    'doug-may-assessment-of-proposed-prices-mou.txt',
    'doug-may-CF-assessment-mou.txt',
    'doug-point-summary-assessment-mou-prices.txt',
    'doug-summary-video.txt',
    
    // Doug's Additional Documents (full documents)
    'HYDRO-QUEBECS-EXPORTS.txt',
    'HYDRO-QUEBECS-IMPORTS.txt',
    'quebecs-electricity-supply-problem.txt',
    'Assessment-of-Proposed-Prices.txt',
    'Proposed-Prices-for-Existing-Power.txt',
    'Understanding-Some-Financial-Concep.txt'
];

// Document cache for Express server
let expressDocumentCache = {};

/**
 * ENGLISH SYSTEM PROMPT
 */
const SYSTEM_PROMPT = `You are the Churchill Falls Information Assistant, powered by Dr. Doug May's expert economic analysis.

CONTEXT AND MISSION:
You help users understand the Churchill Falls hydroelectric project, the December 2024 Memorandum of Understanding (MOU) between Newfoundland and Labrador and Quebec, and Quebec's electricity situation.

AVAILABLE DOCUMENTS:
You have access to Dr. Doug May's expert analyses:
- MOU pricing assessments
- Commercial vs. societal value evaluations
- Quebec electricity landscape context
- Hydro-Québec import/export analyses
- Comparisons with HQ practices
- Video series explaining key concepts

RESPONSE STYLE:
- Professional but accessible
- Explain complex concepts clearly
- Use concrete examples
- Cite sources accurately
- Acknowledge uncertainties
- Present multiple perspectives fairly

CITATION RULES:
- Always cite specific documents when making factual claims
- Format: "According to [Document Name]..."
- Be precise about what each source says
- Distinguish between facts and analysis

YOUR GOAL: Provide accurate, balanced, and helpful information about Churchill Falls and the 2024 MOU.`;

/**
 * FRENCH SYSTEM PROMPT (Quebec French)
 */
const FRENCH_SYSTEM_PROMPT = `Vous êtes l'assistant d'information sur Churchill Falls, alimenté par l'analyse experte du Dr Doug May, économiste.

CONTEXTE ET MISSION:
Vous aidez les utilisateurs à comprendre le projet hydroélectrique de Churchill Falls, le protocole d'entente (PE) de décembre 2024 entre Terre-Neuve-et-Labrador et le Québec, et la situation électrique du Québec.

DIRECTIVES LINGUISTIQUES - FRANÇAIS QUÉBÉCOIS:
- Utilisez la terminologie québécoise, PAS le français de France
- "Hydro-Québec" reste inchangé (nom propre)
- "Électricité" ou "énergie" (selon le contexte)
- "Entente" ou "accord" (pas "affaire")
- "PE" (protocole d'entente) ou "MOU" (acceptable en anglais)
- Termes financiers: vocabulaire commercial québécois
- Format des nombres: 1 000 000 $ (espace comme séparateur de milliers)
- "TWh" = "térawattheures" (TWh est acceptable)

GESTION DES DOCUMENTS:
- Les documents sources sont en anglais
- Lisez l'anglais, répondez en français québécois naturel
- Pour les citations: "Selon le document [titre]..." ou "D'après l'analyse du Dr May..."
- Maintenez toutes les règles de citation
- Les liens vidéo restent en anglais (l'utilisateur peut activer les sous-titres)

DOCUMENTS DISPONIBLES:
Vous avez accès aux analyses expertes du Dr Doug May:
- Évaluations des prix du PE
- Analyses de la valeur commerciale vs valeur sociétale
- Contexte de l'électricité au Québec
- Analyses des importations/exportations d'Hydro-Québec
- Comparaisons avec les pratiques d'HQ
- Série de vidéos explicatives

CONTEXTE QUÉBEC-TERRE-NEUVE:
- Relations historiques complexes entre les deux provinces
- Sensibilité aux tensions historiques liées au contrat de 1969
- Utilisez une terminologie politique appropriée et neutre
- Respectez les perspectives des deux provinces

STYLE DE RÉPONSE:
- Professionnel mais accessible
- Expliquez clairement les concepts complexes
- Utilisez des exemples concrets
- Citez les sources avec précision
- Reconnaissez les incertitudes
- Présentez plusieurs perspectives de façon équitable

RÈGLES DE CITATION:
- Citez toujours les documents spécifiques pour les affirmations factuelles
- Format: "Selon [Nom du Document]..." ou "D'après l'analyse du Dr May dans [document]..."
- Soyez précis sur ce que dit chaque source
- Distinguez entre les faits et l'analyse

VOTRE OBJECTIF: Fournir des informations précises, équilibrées et utiles sur Churchill Falls et le PE de 2024.`;

/**
 * Initialize Express document cache
 */
async function initializeExpressCache() {
  console.log('Initializing Express server document cache (Doug voice mode)...');
  
  let loadedCount = 0;
  let totalSize = 0;
  
  for (const filename of DOUG_DOCUMENTS) {
    const filePath = path.join(CONTENT_DIR, filename);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const size = Buffer.byteLength(content, 'utf-8');
      
      expressDocumentCache[filename] = {
        content: content,
        size: size,
        name: filename
      };
      
      loadedCount++;
      totalSize += size;
      
      console.log(`✓ Loaded: ${filename} (${(size / 1024).toFixed(2)} KB)`);
    } catch (error) {
      console.error(`⚠ Warning: Could not load ${filename} - ${error.message}`);
    }
  }
  
  console.log(`\n✓ Loaded ${loadedCount}/${DOUG_DOCUMENTS.length} core documents for Doug's voice mode`);
  console.log(`✓ Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`✓ Express server ready for fast bilingual voice responses\n`);
  
  if (loadedCount === 0) {
    console.error('✗ ERROR: No documents loaded! Check /content/ directory');
  }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    documentsLoaded: Object.keys(expressDocumentCache).length,
    mode: 'voice-optimized-bilingual',
    languages: ['en', 'fr']
  });
});

// Chat endpoint with bilingual support
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [], language = 'en' } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Select system prompt based on language
    const systemPrompt = language === 'fr' ? FRENCH_SYSTEM_PROMPT : SYSTEM_PROMPT;
    
    // Build context from loaded documents
    let documentContext = '\n\n=== AVAILABLE DOCUMENTS ===\n\n';
    for (const [filename, doc] of Object.entries(expressDocumentCache)) {
      documentContext += `--- ${filename} ---\n${doc.content}\n\n`;
    }
    
    // Build messages array
    const messages = [...conversationHistory];
    
    // Add document context to first message or current message
    const userMessage = messages.length === 0 
      ? `${documentContext}\n\nUser Question: ${message}`
      : message;
    
    messages.push({
      role: 'user',
      content: userMessage
    });
    
    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages
    });
    
    const assistantMessage = response.content[0].text;
    
    // Update conversation history
    const updatedHistory = [
      ...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: assistantMessage }
    ];
    
    // Keep conversation history manageable (last 10 exchanges)
    const trimmedHistory = updatedHistory.slice(-20);
    
    res.json({
      response: assistantMessage,
      conversationHistory: trimmedHistory
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Failed to process chat message',
      details: error.message 
    });
  }
});

// ORIGINAL WORKING VOICE ENDPOINT
app.post("/api/voice", async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: "Text is required" });
        }

        const audioStream = await voice.textToSpeech({
            textInput: text,
        });

        res.set({
            "Content-Type": "audio/mpeg",
            "Transfer-Encoding": "chunked",
        });

        audioStream.pipe(res);
    } catch (error) {
        console.error("Voice synthesis error:", error);
        res.status(500).json({ error: "Voice synthesis failed" });
    }
});

// Document API endpoints
app.get('/api/documents', (req, res) => {
  const documentList = Object.keys(expressDocumentCache).map(filename => ({
    filename: filename,
    size: expressDocumentCache[filename].size
  }));
  
  res.json({
    count: documentList.length,
    documents: documentList
  });
});

app.get('/api/document/:filename', (req, res) => {
  const filename = req.params.filename;
  
  if (expressDocumentCache[filename]) {
    res.json({
      filename: filename,
      content: expressDocumentCache[filename].content,
      size: expressDocumentCache[filename].size
    });
  } else {
    res.status(404).json({
      error: 'Document not found in core documents'
    });
  }
});

// Start server
async function startServer() {
  try {
    // Initialize document cache first
    await initializeExpressCache();
    
    // Then start Express server
    app.listen(PORT, () => {
      console.log(`Churchill Falls Express Server running on port ${PORT}`);
      console.log(`Bilingual voice mode with ${Object.keys(expressDocumentCache).length} core documents loaded`);
      console.log(`Languages supported: English, Français (Quebec)`);
      console.log(`Visit http://localhost:${PORT} to access the assistant`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();