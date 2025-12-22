"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentValidatorAgent = void 0;
const BaseAgent_1 = require("../BaseAgent");
const llmClient_1 = require("../../utils/llmClient");
class DocumentValidatorAgent extends BaseAgent_1.BaseAgent {
    constructor() {
        super(...arguments);
        this.requiredDocuments = [
            { type: 'PAN', description: 'PAN Card' },
            { type: 'AADHAAR', description: 'Aadhaar Card' },
            { type: 'ADDRESS_PROOF', description: 'Address Proof' }
        ];
    }
    setNextAgent(agent) {
        this.nextAgent = agent;
    }
    async handle(input, context) {
        const { documents = [] } = context.userData || {};
        const missingDocs = this.requiredDocuments.filter(doc => !documents.some((d) => d.type === doc.type));
        if (missingDocs.length > 0) {
            return this.createSuccessResponse(this.getMissingDocumentsMessage(missingDocs), {
                suggestions: this.getDocumentAlternatives(missingDocs),
                actions: ['UPLOAD_DOCUMENT', 'SKIP_FOR_NOW']
            });
        }
        // Example of using the LLM client
        try {
            const response = await llmClient_1.llmClient.chat.completions.create({
                model: this.llmConfig.groq.defaultModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a document validation assistant.'
                    },
                    {
                        role: 'user',
                        content: `Please validate these documents: ${JSON.stringify(documents)}`
                    }
                ]
            });
            // Process the LLM response
            const content = response.choices[0]?.message?.content || '';
            console.log('LLM Response:', content);
        }
        catch (error) {
            console.error('Error calling LLM:', error);
        }
        return await this.nextAgent?.handle(input, context) || this.createSuccessResponse('Processing complete');
    }
    getMissingDocumentsMessage(missing) {
        return `Please provide the following documents: ${missing.map(d => d.description).join(', ')}`;
    }
    getDocumentAlternatives(missing) {
        // Map missing documents to their alternative options
        return missing.map(doc => {
            switch (doc.type) {
                case 'PAN':
                    return 'You can provide a PAN card or Form 60 as an alternative';
                case 'AADHAAR':
                    return 'You can provide an Aadhaar card, passport, or voter ID as an alternative';
                case 'ADDRESS_PROOF':
                    return 'You can provide a utility bill, rental agreement, or bank statement as an address proof';
                default:
                    return `Please provide a valid ${doc.type} document`;
            }
        });
    }
}
exports.DocumentValidatorAgent = DocumentValidatorAgent;
