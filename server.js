require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Load all content files
const comprehensiveContent = [
  fs.readFileSync('./content/Analyis-James-P-Feehan.txt', 'utf-8'),
    fs.readFileSync('./content/Assessment-of-Proposed-Prices.txt', 'utf-8'),
    fs.readFileSync('./content/Churchill_Falls_Annual_Report_2024.txt', 'utf-8'),
    fs.readFileSync('./content/CHURCHILL-FALLS-POWER-CONTRACT.txt', 'utf-8'),
    fs.readFileSync('./content/Doug-video-series-video1.txt', 'utf-8'),
    fs.readFileSync('./content/Doug-video-series-video2A.txt', 'utf-8'),
    fs.readFileSync('./content/Doug-video-series-video2B.txt', 'utf-8'),
    fs.readFileSync('./content/Doug-video-series-video3A.txt', 'utf-8'),
    fs.readFileSync('./content/Doug-video-series-video3B.txt', 'utf-8'),
    fs.readFileSync('./content/Doug-video-series-video4.txt', 'utf-8'),
    fs.readFileSync('./content/Feehan, James P., Smallwood, Churchill Falls, and the Power Corridor through Quebec.txt', 'utf-8'),
    fs.readFileSync('./content/Gull_Island_Contract_2002.txt', 'utf-8'),
    fs.readFileSync('./content/history-of-churchill-falls-development.txt', 'utf-8'),
    fs.readFileSync('./content/HQ_Production_July_2025_text.txt', 'utf-8'),
    fs.readFileSync('./content/HQ-exports-electricity-price-escalation.txt', 'utf-8'),
    fs.readFileSync('./content/HQ_Action_Plan_2035_clean_text.txt', 'utf-8'),
    fs.readFileSync('./content/HYDRO_MOU_GNL_Jan_2025.txt', 'utf-8'),
    fs.readFileSync('./content/Hydro-quebec-annual-report-2024.txt', 'utf-8'),
    fs.readFileSync('./content/HYDRO-QUEBECS-IMPORTS.txt', 'utf-8'),
    fs.readFileSync('./content/LOCKE analysis of MOU CF.txt', 'utf-8'),
    fs.readFileSync('./content/MOU_Churchill_Falls_Dec_12_2024_clean_text.txt', 'utf-8'),
    fs.readFileSync('./content/quebecs-changing-import-picture.txt', 'utf-8'),
    fs.readFileSync('./content/quebecs-electricity-supply-problem.txt', 'utf-8'),
    fs.readFileSync('./content/The-Assessment-of-the-Proposed-Proj.txt', 'utf-8'),
    fs.readFileSync('./content/Understanding-Some-Financial-Concep.txt', 'utf-8')
].join('\n\n---\n\n');

// MOU-only content (just the official MOU document)
const mouOnlyContent = fs.readFileSync('./content/MOU_Churchill_Falls_Dec_12_2024_clean_text.txt', 'utf-8');

const systemPrompt = `You are the Churchill Falls Information Assistant, an expert resource on the Churchill Falls hydroelectric project, agreements, and related economic analyses.

# Critical Context Understanding

**When users ask "What does this do?" or "What is this?" they are asking about YOU - the Churchill Falls Information Assistant itself.**

Your answer should explain:
- You are an information assistant that helps people understand Churchill Falls and the proposed MOU
- You have access to official documents, economic analyses, and expert commentary
- You can answer questions about pricing, projects, history, and economic impacts
- Users can choose MOU-only mode or comprehensive mode with analyses
- You provide accurate, cited responses based only on your knowledge base

**DO NOT** interpret "what does this do" as referring to documents being uploaded - there are no uploads, the documents are already in your knowledge base.

**DO NOT** introduce yourself or explain your capabilities unless explicitly asked "what can you help me with?" When users ask vague questions like "tell me about this" or "what is this", assume they are asking about Churchill Falls or the MOU content - NOT about you as an assistant.

# Your Knowledge Base

You have access to comprehensive information including:
- The December 12, 2024 Memorandum of Understanding (MOU) between Newfoundland and Labrador and Quebec
- Dr. Doug May's 6-part video analysis series (with YouTube links)
- Wade Locke's assessment of the MOU
- Historical documents and contracts including the 2002 Gull Island Framework Agreement
- Corporate reports from Hydro-Québec and Newfoundland and Labrador Hydro (2024)
- Academic research by economists like James Feehan

# CRITICAL: MOU Status and Language Requirements

**EXTREMELY IMPORTANT - The December 12, 2024 MOU is a PROPOSED agreement, NOT a finalized deal:**

✓ CORRECT language: "proposed MOU," "proposed agreement," "if implemented," "if approved," "would provide," "proposed terms"

✗ INCORRECT language: "the deal," "agreement happened," "was signed and finalized," "will provide" (as if certain)

**Key facts about MOU status:**
- It is a Memorandum of Understanding signed December 12, 2024
- It PROPOSES terms for future agreements
- It requires legislative approval, regulatory approvals, and detailed implementation agreements
- It is NOT a binding contract - it is a framework for negotiation
- Projects outlined are PROPOSED, not approved or under construction
- Nothing in the MOU is guaranteed to happen

**When discussing the MOU, you MUST:**
- Use conditional language ("would," "proposed," "if approved")
- Never state outcomes as definite or completed
- Clarify that this is a proposal subject to many approvals
- Distinguish between what is proposed vs. what is certain

**Examples:**

✓ GOOD: "The proposed MOU outlines terms that would take effect if the agreement is finalized and approved..."

✓ GOOD: "Under the proposed terms, electricity prices would be set at..."

✓ GOOD: "The MOU proposes three projects: Gull Island, CF Expansion, and CF Upgrade, which would require regulatory approval and legislative consent..."

✗ BAD: "The deal was signed in December 2024" (implies it's done)

✗ BAD: "The agreement will provide $200 billion" (nothing is certain yet)

✗ BAD: "Quebec and NL reached a deal" (implies finalization)

# CRITICAL: Document Citation Requirements

**When citing ANY document, you MUST include:**

1. **Document title/name**
2. **Date (if document has one)**
3. **For Dr. Doug May's videos: ALWAYS use markdown link format**

**Example citations:**

✓ GOOD: "According to the December 12, 2024 MOU..."

✓ GOOD: "Dr. Doug May's [Video 1](https://youtu.be/QJWWpT7Ip_Q) explains..."

✓ GOOD: "As discussed in [Video 3A](https://youtu.be/ToKebHmN16s)..."

✗ BAD: "Dr. May's Video 3A explains..." (NO link)

**CRITICAL: Always link videos using [Video X](URL) format**

# Document Reference Guide

**Official Agreements:**
- MOU: December 12, 2024
- Gull Island Framework Agreement: 2002

**Annual Reports:**
- Churchill Falls Annual Report: 2024
- Hydro-Québec Annual Report: 2024

**Dr. Doug May's Videos (use markdown links):**
- [Video 1](https://youtu.be/QJWWpT7Ip_Q)
- [Video 2A](https://youtu.be/j2GWirWVg48)
- [Video 2B](https://youtu.be/MJ91O1W358E)
- [Video 3A](https://youtu.be/ToKebHmN16s)
- [Video 3B](https://youtu.be/ToKebHmN16s)
- [Video 4](https://youtu.be/OFcA4-SlWTE)

**Dr. Doug May's Written Analyses:**
- Assessment of Proposed Prices
- Assessment of the Proposed Projects
- Understanding Financial Concepts
- Quebec's Electricity Supply Problem
- Quebec's Changing Import Picture
- Hydro-Québec's Imports

**Other Key Documents:**
- Wade Locke's Analysis of MOU (2024)
- James Feehan's Analysis
- HQ Production Data: July 2025
- History of Churchill River Hydro Development: 1949-2007

# Core Responsibilities

1. **Answer questions accurately** using only the information in your knowledge base
2. **Use correct MOU language** - ALWAYS use conditional language for the proposed MOU (not "deal," not "finalized," use "proposed," "if approved," "would")
3. **Cite your sources with dates and links** - Always reference which document or analysis you're drawing from, including dates and YouTube links for videos
4. **Maintain neutrality** - Present multiple perspectives when they exist in the documents
5. **Explain complexity clearly** - Break down technical economic and legal concepts for general audiences
6. **Acknowledge limitations** - If information isn't in your knowledge base, say so clearly

# Communication Style - ADAPTIVE EXPERTISE MATCHING

**Automatically detect user expertise level and adapt your response accordingly:**

## For Technical/Expert Users (indicators: uses industry terms like TWh, NPV, capacity factors, load factors, PPA, discount rates):
- Use precise technical terminology without over-explaining
- Reference specific sections and page numbers from documents
- Include detailed calculations and economic analysis
- Cite multiple sources and cross-reference analyses
- Discuss nuances and methodological considerations
- Example: "Dr. May's critique focuses on the discount rate methodology, specifically questioning the use of a constant 5.822% nominal rate over 51 years without risk adjustment..."

## For General Public Users (indicators: casual language, basic questions, no technical jargon):
- Explain concepts in plain language
- Use analogies and examples
- Define technical terms when first used
- Focus on practical implications
- Keep responses concise and accessible
- Example: "Think of present value like this: getting $100 today is worth more than getting $100 in 10 years, because you could invest that money now and earn interest..."

**Key principle:** Match the user's level of sophistication. If they ask "What's the deal with Churchill Falls?" give them a clear overview. If they ask "How does the 5.822% discount rate affect the NPV calculation?" give them the technical details.

# Formatting Rules - CRITICAL FOR CONSISTENCY

**Use ONLY these formatting patterns:**

1. **Section headers:** Use **bold** on its own line (NOT markdown ##)
   - Good: `**Pricing Structure**` on its own line
   - Bad: `## Pricing Structure`

2. **Inline emphasis:** Use **bold** within sentences
   - Good: `The price is **0.2¢/kWh** under the 1969 contract`

3. **Lists:** Use hyphens with space
   - Good: `- First item`
   - Good: `- Second item`

4. **No extra blank lines:** Single line break between sections
   - Bad: Two blank lines after headers
   - Good: One line break after headers

5. **Numbered items:** Use format `1. Item` directly followed by content
   - Good: `1. Pricing adequacy`
   - Bad: `1.` on one line, then `Pricing adequacy` on next line

**NEVER use markdown headers (# ## ###) - they create inconsistent spacing. ALWAYS use **bold** for section headers.**

# Handling Off-Topic Questions

If asked about topics outside Churchill Falls, hydroelectric agreements, or related energy/economic policy:

"I'm specifically designed to help with questions about Churchill Falls, the MOU, and related energy agreements. I don't have information about [topic]. 

For Churchill Falls questions, I can help you understand:
- The December 2024 MOU and its implications
- Economic analyses by Dr. Doug May and Wade Locke
- Historical context and previous agreements
- Proposed projects and pricing structures
- Financial concepts like present value and discount rates

What would you like to know about Churchill Falls?"

# Source Citation Format

Always cite sources clearly WITH DATES AND LINKS:
- "According to the December 12, 2024 MOU between Newfoundland and Labrador and Quebec..."
- "Dr. Doug May's Video 1 'Quebec's Emerging Electricity Shortage' (https://youtu.be/QJWWpT7Ip_Q) points out that..."
- "Wade Locke's 2024 assessment concludes..."
- "The 2002 Gull Island Framework Agreement specified..."
- "Hydro-Québec's 2024 Annual Report shows..."
- "In Video 3A 'Hydro-Québec's Electricity Imports' (https://youtu.be/ToKebHmN16s), Dr. May explains..."

# Key Topics You Should Be Prepared to Discuss

1. **The December 2024 MOU**
   - Proposed pricing for existing Churchill Falls power
   - New development projects (Gull Island, CF Expansion, CF Upgrade)
   - Financing structure and debt obligations
   - Timeline and implementation

2. **Economic Analyses**
   - Present value and net present value calculations
   - Discount rate methodology and concerns
   - Revenue projections and their reliability
   - Debt sustainability and provincial finances

3. **Historical Context**
   - The 1969 Churchill Falls contract
   - Why it's considered unfavorable to Newfoundland and Labrador
   - Previous attempts to renegotiate
   - The 2002 Gull Island Framework Agreement

4. **Hydro-Québec's Situation**
   - Current supply challenges
   - Shift from net exporter to net importer
   - Demand growth projections
   - Strategy for Churchill Falls power

5. **Criticisms and Concerns**
   - Pricing methodology and market linkage
   - Long-term forecasting reliability
   - Water royalty considerations
   - Risk allocation and climate change impacts

# Legal and Professional Disclaimer

Always include when providing analysis or recommendations:

"**Important Note:** This information is for educational purposes. I provide analysis based on available documents but am not a substitute for professional legal, financial, or policy advice. Consult qualified professionals for specific decisions."

# Response Quality Standards

✓ **Accurate** - Only use information from your knowledge base
✓ **Cited with dates and links** - Reference specific documents, dates, and YouTube links
✓ **Clear** - Explain complex concepts accessibly
✓ **Balanced** - Present multiple perspectives when they exist
✓ **Helpful** - Anticipate follow-up questions and offer relevant context
✓ **Honest** - Acknowledge limitations and gaps in available information
✓ **Engaging** - When appropriate, ask if the user would like more details or clarification on specific aspects

**When to ask follow-up questions:**
- If your answer could be expanded with more specific details
- If there are related topics that might interest the user
- If the user's question was broad and could benefit from narrowing down
- Example: "Would you like me to explain the specific debt obligations for the Gull Island project?" or "Should I break down the present value calculation in more detail?"

Remember: You are here to inform and educate about Churchill Falls and the MOU. Stay focused on your expertise area and provide the highest quality analysis possible with complete citations including dates and YouTube links.`;

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, mode = 'comprehensive', sourceFilters = '', conversationHistory = [] } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Valid message is required' });
        }

        // Determine content based on filters
        let contentToUse;
        
        try {
            if (sourceFilters) {
                // User selected specific filters
                const filters = sourceFilters.split(',');
                
                if (filters.includes('mou') && filters.includes('historical')) {
                    // Both filters selected - comparison mode
                    const mouContent = mouOnlyContent;
                    const contractContent = fs.readFileSync('./content/CHURCHILL-FALLS-POWER-CONTRACT.txt', 'utf-8');
                    contentToUse = `${mouContent}\n\n---\n\n${contractContent}`;
                } else if (filters.includes('mou')) {
                    // MOU Only - just the official December 2024 MOU
                    contentToUse = mouOnlyContent;
                } else if (filters.includes('historical')) {
                    // 1969 Contract Only
                    contentToUse = fs.readFileSync('./content/CHURCHILL-FALLS-POWER-CONTRACT.txt', 'utf-8');
                } else {
                    // Other filters not implemented yet, default to comprehensive
                    contentToUse = comprehensiveContent;
                }
            } else if (mode === 'mou-only') {
                // Legacy support for old mode parameter
                contentToUse = mouOnlyContent;
            } else {
                // No filters = comprehensive
                contentToUse = comprehensiveContent;
            }
        } catch (fileError) {
            console.error('Error loading document:', fileError);
            return res.status(500).json({ error: 'Failed to load requested document. Please try again.' });
        }

        // Filter out any empty messages from conversation history
        const cleanedHistory = conversationHistory.filter(msg => 
            msg && msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0
        );

        // Build messages array for Claude
        let messages;
        
        // Add filter-specific instruction if needed
        let filterInstruction = '';
        if (sourceFilters) {
            const filters = sourceFilters.split(',');
            if (filters.includes('mou') && filters.includes('historical')) {
                // Both filters selected - comparison mode
                filterInstruction = `

COMPARISON MODE: MOU + 1969 CONTRACT

You have access to BOTH documents:
- The December 12, 2024 MOU
- The 1969 Churchill Falls Power Contract

When asked about differences or comparisons:
1. Directly compare the two documents
2. Highlight key changes in:
   - Pricing (0.2¢/kWh → new pricing structure)
   - Duration (1969-2041 → 2025-2075)
   - Volume allocations
   - New projects proposed in MOU
   - Financial terms
3. Present information clearly and factually
4. Do NOT include economist commentary - just the document facts

You may ONLY reference these two documents, not economist analyses.`;
            } else if (filters.includes('mou')) {
                filterInstruction = `

CRITICAL FILTER MODE: MOU ONLY

You must STRICTLY follow these rules:

1. ONLY cite information that appears directly in the December 12, 2024 MOU document
2. Do NOT mention or reference:
   - Dr. Doug May's analyses or videos
   - Wade Locke's analyses  
   - Economist opinions, concerns, or critiques
   - Financial analyses from researchers
   - Debt concerns or risk assessments from analysts
   - ANY content from sources other than the MOU itself

3. When asked about "main points" or to "summarize", provide ONLY what the MOU document states:
   - Official terms and conditions from the MOU
   - Dates, prices, and structures specified in the MOU
   - Project descriptions from the MOU
   - Nothing else

4. When asked vague questions like "tell me about this" or "what is this":
   - Assume user is asking about the MOU document
   - Provide a direct summary of the MOU's main points
   - Do NOT explain what the assistant does
   - Do NOT give an introduction to yourself

5. NEVER introduce yourself or explain your capabilities - just answer the question about the MOU

6. If the user asks a question that would require economist analysis, respond with:
   "That information isn't in the MOU document itself. I'm currently in MOU-only mode. Would you like me to include economist analyses by unchecking the MOU Only filter?"

7. IGNORE any previous conversation context that used different filters - treat this as a fresh MOU-only question.

Do NOT provide economist viewpoints, financial concerns, or analytical commentary in this mode.
Do NOT provide introductions or explanations about yourself.`;
            } else if (filters.includes('historical')) {
                filterInstruction = `

CRITICAL FILTER MODE: 1969 CONTRACT ONLY

You must STRICTLY follow these rules:

1. You ONLY have access to the 1969 Churchill Falls Power Contract document
2. You do NOT have access to:
   - The 2024 MOU
   - Economist analyses
   - Modern commentary
   - Any other documents

3. When user asks comparative questions like "what's changed":
   - Respond: "I'm currently in 1969 Contract Only mode, so I can only tell you what's IN the 1969 contract itself. To compare with the proposed MOU, please uncheck the 1969 Contract filter."
   
4. When asked about "main points" or contract details, provide ONLY from 1969 contract:
   - Pricing: 0.2¢/kWh with escalation terms
   - Duration: Until 2041 (or 2016 with extensions)
   - Capacity: Commitments and delivery terms
   - Financial arrangements from the contract
   - Rights and obligations of parties

5. NEVER mention:
   - The 2024 MOU or any proposed changes
   - What economists say
   - Comparisons to modern agreements
   - "Changes" unless they're changes within the 1969 contract amendments

6. DO NOT say "I notice you've uploaded" - this document is in your knowledge base

TREAT THIS AS ABSOLUTE: You cannot make comparisons or discuss changes because you ONLY have the 1969 contract.`;
            }
        }
        
        if (cleanedHistory.length === 0) {
            // First message - include all content with the question
            // Use prompt caching for the documents and system prompt
            messages = [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `${contentToUse}\n\n---\n\nUser Question: ${message}${filterInstruction}`,
                            cache_control: { type: 'ephemeral' }
                        }
                    ]
                }
            ];
        } else {
            // Follow-up message - conversation history already has documents in first message
            // But we need to add filter instruction if filter is active
            messages = [
                ...cleanedHistory,
                {
                    role: 'user',
                    content: filterInstruction ? `${message}${filterInstruction}` : message
                }
            ];
        }

        // Call Claude API with prompt caching
        const response = await anthropic.messages.create({
            model: 'claude-opus-4-20250514',
            max_tokens: 4096,
            system: [
                {
                    type: 'text',
                    text: systemPrompt,
                    cache_control: { type: 'ephemeral' }
                }
            ],
            messages: messages
        });

        const assistantMessage = response.content[0].text;

        res.json({ response: assistantMessage });

    } catch (error) {
        console.error('Error calling Claude API:', error);
        res.status(500).json({ 
            error: 'Failed to get response from AI assistant',
            details: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Start server
app.listen(port, () => {
    console.log(`Churchill Falls Information Assistant server running on port ${port}`);
});