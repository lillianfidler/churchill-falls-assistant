#!/usr/bin/env node

/**
 * Churchill Falls MCP Server - HYBRID VERSION
 * 
 * Model Context Protocol server for managing Churchill Falls SUPPLEMENTARY documents
 * Core documents are loaded directly into Express server context for fast access
 * This server only handles historical/supplementary documents
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs').promises;
const path = require('path');

// Document directory
const CONTENT_DIR = path.join(__dirname, 'content');

// ALL DOCUMENTS (36 total - complete set)
// Documents are loaded into MCP for text mode AND Express for voice mode
const DOCUMENTS = [
  // PRIMARY MOU AND ANALYSIS (Core documents)
  'MOU_Churchill_Falls_Dec_12_2024_clean_text.txt',
  'LOCKE analysis of MOU CF.txt',
  'Reassessing-the-Churchill-Falls-MOU.txt',
  
  // Doug May's Video Analysis (CRITICAL - needed for text mode)
  'Doug-video-series-video1.txt',
  'Doug-video-series-video2A.txt',
  'Doug-video-series-video2B.txt',
  'Doug-video-series-video3A.txt',
  'Doug-video-series-video3B.txt',
  'Doug-video-series-video4.txt',
  
  // 2024 Financial Statements
  'Churchill-falls-consolidated-financial-statements-2024.txt',
  'Lower-Churchill-Project-Combined-Financial-Statements-2024.txt',
  
  // Hydro-Quebec Exports
  'HYDRO-QUEBECS-EXPORTS.txt',
  
  // 2023 Financial Statements
  'Churchill-Falls-2023-financial-statement.txt',
  
  // Analysis and Assessment Documents
  'Analyis-James-P-Feehan.txt',
  'Assessment-of-Proposed-Prices.txt',
  
  // Churchill Falls Historical Documents
  'Churchill_Falls_Annual_Report_2024.txt',
  'Churchill-falls-consolidated-financial-statements-2022.txt',
  'Churchill-falls-financial-statements-2021.txt',
  'CHURCHILL-FALLS-POWER-CONTRACT.txt',
  
  // Historical and Academic Documents
  'Feehan, James P., Smallwood, Churchill Falls, and the Power Corridor through Quebec.txt',
  'Gull_Island_Contract_2002.txt',
  'History_Churchill_River_Hydro_Development_1949-2007.txt',
  'history-of-churchill-falls-development.txt',
  
  // Hydro-Québec Documents
  'HQ_Action_Plan_2035_clean_text.txt',
  'HQ_Production_July_2025_text.txt',
  'HQ-exports-electricity-price-escalation.txt',
  'hq-quarterly-bulletin.txt',
  'HYDRO_MOU_GNL_Jan_2025.txt',
  'Hydro-quebec-annual-report-2024.txt',
  'HYDRO-QUEBECS-IMPORTS.txt',

  
  // MOU Supporting Documents
  'MOU_s_Societal_Values.txt',
  
  // Lower Churchill Project
  'lower-churchill-projects.txt',
  
  // Additional Analysis Documents
  'NL-Debt-Fiscal-Sustainability.txt',
  'Proposed-Prices-for-Existing-Power.txt',
  'quebecs-changing-import-picture.txt',
  'quebecs-electricity-supply-problem.txt',
  'The-Assessment-of-the-Proposed-Proj.txt',
  'Understanding-Some-Financial-Concep.txt'
];

// CORE DOCUMENTS (REMOVED FROM MCP - NOW IN EXPRESS SERVER CONTEXT)
// These 15 documents are loaded into the Express server for immediate access:
// - MOU_Churchill_Falls_Dec_12_2024_summary.txt
// - Reassessing-the-Churchill-Falls-MOU.txt
// - Doug-video-series-video1-summary.txt
// - Doug-video-series-video2A-summary.txt
// - Doug-video-series-video2B-summary.txt
// - Doug-video-series-video3A.txt
// - Doug-video-series-video3B.txt
// - Doug-video-series-video4.txt
// - HYDRO-QUEBECS-EXPORTS.txt
// - HYDRO-QUEBECS-IMPORTS.txt
// - Assessment-of-Proposed-Prices.txt
// - Proposed-Prices-for-Existing-Power.txt
// - quebecs-changing-import-picture.txt
// - quebecs-electricity-supply-problem.txt
// - The-Assessment-of-the-Proposed-Proj.txt


// Document cache
let documentCache = {};

/**
 * Initialize document cache
 */
async function initializeCache() {
  console.error('Initializing Churchill Falls MCP supplementary document cache...');
  
  let loadedCount = 0;
  let totalSize = 0;
  
  for (const filename of DOCUMENTS) {
    const filePath = path.join(CONTENT_DIR, filename);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const size = Buffer.byteLength(content, 'utf-8');
      
      documentCache[filename] = {
        content: content,
        size: size,
        name: filename
      };
      
      loadedCount++;
      totalSize += size;
      
      console.error(`✓ Loaded: ${filename} (${(size / 1024).toFixed(2)} KB)`);
    } catch (error) {
      console.error(`⚠ Warning: Could not load ${filename} - ${error.message}`);
    }
  }
  
  console.error(`\n✓ Loaded ${loadedCount}/${DOCUMENTS.length} documents (complete set)`);
  console.error(`✓ Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.error(`✓ All sources available for comprehensive text mode analysis\n`);
  
  if (loadedCount === 0) {
    console.error('❌ ERROR: No documents loaded! Check that /content/ directory exists with .txt files');
  }
}

/**
 * Search documents for keywords
 */
function searchDocuments(query, maxResults = 5) {
  const results = [];
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(/\s+/).filter(k => k.length > 2);
  
  for (const [filename, doc] of Object.entries(documentCache)) {
    const contentLower = doc.content.toLowerCase();
    
    // Calculate relevance score
    let score = 0;
    for (const keyword of keywords) {
      const matches = (contentLower.match(new RegExp(keyword, 'g')) || []).length;
      score += matches;
    }
    
    if (score > 0) {
      // Extract relevant snippets (context around matches)
      const snippets = extractSnippets(doc.content, keywords, 3);
      
      results.push({
        filename: filename,
        score: score,
        snippets: snippets,
        size: doc.size
      });
    }
  }
  
  // Sort by relevance and limit results
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

/**
 * Extract relevant snippets from document
 */
function extractSnippets(content, keywords, maxSnippets = 3) {
  const snippets = [];
  const lines = content.split('\n');
  const contextLines = 2; // Lines before/after match
  
  for (let i = 0; i < lines.length && snippets.length < maxSnippets; i++) {
    const lineLower = lines[i].toLowerCase();
    
    // Check if line contains any keyword
    const hasKeyword = keywords.some(keyword => lineLower.includes(keyword));
    
    if (hasKeyword) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length, i + contextLines + 1);
      const snippet = lines.slice(start, end).join('\n');
      
      snippets.push(snippet.trim());
      i += contextLines; // Skip ahead to avoid overlapping snippets
    }
  }
  
  return snippets;
}

/**
 * Get full document by filename
 */
function getDocument(filename) {
  if (documentCache[filename]) {
    return {
      filename: filename,
      content: documentCache[filename].content,
      size: documentCache[filename].size
    };
  }
  return null;
}

/**
 * List all available documents
 */
function listDocuments() {
  return Object.keys(documentCache).map(filename => ({
    filename: filename,
    size: documentCache[filename].size
  }));
}

/**
 * Create and run the MCP server
 */
async function main() {
  // Initialize document cache
  await initializeCache();
  
  // Create MCP server
  const server = new Server(
    {
      name: 'churchill-falls-mcp-hybrid',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'search_documents',
          description: 'Search through Churchill Falls SUPPLEMENTARY documents (historical, pre-2023 financials, academic papers). Core documents are already in context.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (keywords to find in supplementary documents)',
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of results to return (default: 5)',
                default: 5,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_document',
          description: 'Retrieve the full content of a specific supplementary document by filename.',
          inputSchema: {
            type: 'object',
            properties: {
              filename: {
                type: 'string',
                description: 'Name of the supplementary document file to retrieve',
              },
            },
            required: ['filename'],
          },
        },
        {
          name: 'list_documents',
          description: 'List all available supplementary Churchill Falls documents (historical/academic content only).',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'search_documents') {
        const { query, max_results = 5 } = args;
        const results = searchDocuments(query, max_results);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }
      
      if (name === 'get_document') {
        const { filename } = args;
        const doc = getDocument(filename);
        
        if (!doc) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Document "${filename}" not found in supplementary documents`,
              },
            ],
            isError: true,
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: doc.content,
            },
          ],
        };
      }
      
      if (name === 'list_documents') {
        const docs = listDocuments();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(docs, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('Churchill Falls MCP Hybrid Server running');
  console.error('Supplementary documents ready for search');
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});