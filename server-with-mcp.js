require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');

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

// MCP Client
let mcpClient = null;

/**
 * Initialize MCP client connection
 */
async function initializeMCP() {
    console.log('Initializing MCP client connection...');
    
    try {
        // Spawn the MCP server process
        const serverProcess = spawn('node', ['mcp-server.js'], {
            stdio: ['pipe', 'pipe', 'inherit'], // stdin, stdout, stderr
            cwd: __dirname
        });

        // Create transport
        const transport = new StdioClientTransport({
            command: serverProcess,
        });

        // Create and connect client
        mcpClient = new Client({
            name: 'churchill-falls-express',
            version: '1.0.0',
        }, {
            capabilities: {},
        });

        await mcpClient.connect(transport);
        
        console.log('✓ MCP client connected successfully');
        
        // List available tools
        const tools = await mcpClient.listTools();
        console.log(`✓ Available MCP tools: ${tools.tools.map(t => t.name).join(', ')}`);
        
        return true;
    } catch (error) {
        console.error('✗ Failed to initialize MCP client:', error);
        return false;
    }
}

const systemPrompt = `You are the Churchill Falls Information Assistant, an expert resource on the Churchill Falls hydroelectric project, agreements, and related economic analyses.

# CRITICAL: You Have MCP Tools Available

You have access to a Model Context Protocol (MCP) server with THREE tools for accessing Churchill Falls documents:

1. **search_documents** - Search for relevant information across all documents
   - Use this when you need to find specific information
   - Pass keywords related to the user's question
   - Returns snippets from relevant documents

2. **get_document** - Retrieve full content of a specific document
   - Use this when you need complete document content
   - Pass the exact filename
   - Returns the entire document

3. **list_documents** - See all available documents
   - Use this to see what documents are available
   - Returns list of all filenames

## When to Use MCP Tools

**ALWAYS use search_documents for:**
- Answering questions about Churchill Falls
- Finding specific facts, numbers, or quotes
- Comparing information across documents
- Any query that requires document content

**Example workflow:**
User: "What does the 2024 MOU say about pricing?"
1. Call search_documents with query "2024 MOU pricing"
2. Read the results
3. If you need more context, call get_document on specific files
4. Answer the user's question with citations

**DO NOT** try to answer from memory - ALWAYS search the documents first.

# Your Knowledge Base (Accessed via MCP)

The MCP server has access to comprehensive information including:
- The December 12, 2024 Memorandum of Understanding (MOU)
- Dr. Doug May's 6-part video analysis series
- Wade Locke's assessment of the MOU
- Historical documents and contracts
- Corporate reports from Hydro-Québec and NL Hydro (2024)
- Academic research by economists
- **Detailed Financial Statements:**
  - Churchill Falls Consolidated Financial Statements (2024, 2023, 2022, 2021)
  - Lower Churchill Project Combined Financial Statements (2024)

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

# CRITICAL: Document Citation Requirements

**When citing ANY document, you MUST include:**

1. **Document title/name**
2. **Date (if document has one)**
3. **For Dr. Doug May's videos: ALWAYS use markdown link format**

**Example citations:**

✓ GOOD: "According to the December 12, 2024 MOU..."

✓ GOOD: "Dr. Doug May's [Video 1](https://youtu.be/QJWWpT7Ip_Q) explains..."

✓ GOOD: "Churchill Falls' 2024 Consolidated Financial Statements show..."

✗ BAD: "The document says..." (no specific reference)

**CRITICAL: Always link videos using [Video X](URL) format**

# Dr. Doug May's Video Links

- [Video 1: Quebec's Emerging Electricity Shortage](https://youtu.be/QJWWpT7Ip_Q)
- [Video 2A: Assessment of Proposed Prices](https://youtu.be/j2GWirWVg48)
- [Video 2B: Assessment of Proposed Prices (continued)](https://youtu.be/MJ91O1W358E)
- [Video 3A: Hydro-Québec's Electricity Imports](https://youtu.be/ToKebHmN16s)
- [Video 3B: Hydro-Québec's Electricity Imports (continued)](https://youtu.be/ToKebHmN16s)
- [Video 4: Assessment of Proposed Projects](https://youtu.be/OFcA4-SlWTE)

# Sources Referenced Section - REQUIRED

At the end of EVERY response that references documents, include a "Sources Referenced" section.

Format example:
---
Sources Referenced:
- [Video 1: Quebec's Emerging Electricity Shortage](https://youtu.be/QJWWpT7Ip_Q)
- December 12, 2024 MOU
- Churchill Falls Consolidated Financial Statements 2024

# Communication Style - ADAPTIVE EXPERTISE MATCHING

**Automatically detect user expertise level and adapt your response accordingly:**

## For Technical/Expert Users:
- Use precise technical terminology
- Include detailed calculations and analysis
- Cite multiple sources and cross-reference
- Discuss nuances and methodological considerations

## For General Public Users:
- Explain concepts in plain language
- Use analogies and examples
- Define technical terms when first used
- Focus on practical implications
- Keep responses concise and accessible

# Formatting Rules

**Use ONLY these formatting patterns:**

1. **Section headers:** Use **bold** on its own line (NOT markdown ##)
2. **Inline emphasis:** Use **bold** within sentences
3. **Lists:** Use hyphens with space (- Item)
4. **No extra blank lines:** Single line break between sections
5. **Numbered items:** Keep number and text on SAME line
6. **NEVER use blockquotes (> symbol)**
7. **Links:** ONLY for videos and external URLs
8. **Complete all responses:** NEVER leave incomplete

# Response Quality Standards

✓ **Use MCP tools first** - Always search documents before answering
✓ **Accurate** - Only use information from documents
✓ **Cited with dates and links** - Reference specific documents
✓ **Clear** - Explain complex concepts accessibly
✓ **Balanced** - Present multiple perspectives
✓ **Helpful** - Anticipate follow-up questions
✓ **Honest** - Acknowledge limitations

Remember: You are here to inform and educate about Churchill Falls and the MOU. ALWAYS use MCP tools to search documents before answering questions.`;

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Valid message is required' });
        }

        // Check MCP connection
        if (!mcpClient) {
            return res.status(503).json({ 
                error: 'MCP server not available. Please try again shortly.' 
            });
        }

        // Filter conversation history
        const cleanedHistory = conversationHistory.filter(msg => 
            msg && msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0
        );

        // Build messages array for Claude
        const messages = [
            ...cleanedHistory,
            {
                role: 'user',
                content: message
            }
        ];

        // Get available MCP tools
        const toolsList = await mcpClient.listTools();
        
        // Format tools for Claude
        const tools = toolsList.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema
        }));

        // Call Claude API with MCP tools
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            system: systemPrompt,
            messages: messages,
            tools: tools
        });

        let finalText = '';
        let currentMessages = [...messages];

        // Handle tool use
        while (response.stop_reason === 'tool_use' || 
               (response.content && response.content.some(block => block.type === 'tool_use'))) {
            
            // Process each content block
            const assistantMessage = {
                role: 'assistant',
                content: response.content
            };
            currentMessages.push(assistantMessage);

            // Execute tool calls
            const toolResults = [];
            
            for (const block of response.content) {
                if (block.type === 'tool_use') {
                    console.log(`Executing MCP tool: ${block.name}`, block.input);
                    
                    try {
                        const result = await mcpClient.callTool({
                            name: block.name,
                            arguments: block.input
                        });
                        
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: result.content[0].text
                        });
                    } catch (error) {
                        console.error(`Error calling tool ${block.name}:`, error);
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: `Error: ${error.message}`,
                            is_error: true
                        });
                    }
                }
            }

            // Add tool results to conversation
            currentMessages.push({
                role: 'user',
                content: toolResults
            });

            // Get Claude's next response
            const nextResponse = await anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 4096,
                system: systemPrompt,
                messages: currentMessages,
                tools: tools
            });

            response = nextResponse;
        }

        // Extract final text response
        for (const block of response.content) {
            if (block.type === 'text') {
                finalText += block.text;
            }
        }

        res.json({ response: finalText });

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
    res.json({ 
        status: 'healthy',
        mcp_connected: mcpClient !== null
    });
});

// Start server
async function startServer() {
    // Initialize MCP connection
    const mcpInitialized = await initializeMCP();
    
    if (!mcpInitialized) {
        console.error('WARNING: MCP server not available. Some features may not work.');
    }
    
    app.listen(port, () => {
        console.log(`Churchill Falls Information Assistant server running on port ${port}`);
        console.log(`MCP Status: ${mcpInitialized ? 'Connected ✓' : 'Disconnected ✗'}`);
    });
}

startServer();