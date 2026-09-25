import { GoogleGenAI, Type } from '@google/genai';
import { DistressAnalysis, AlertPriority } from '../types.ts';

export class DistressAnalyzer {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim() !== '' && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        this.ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });
      } catch (err) {
        console.warn('Failed to initialize GoogleGenAI client:', err);
        this.ai = null;
      }
    }
  }

  public async analyzeDistressMessage(
    text: string,
    shipName?: string
  ): Promise<DistressAnalysis> {
    if (this.ai) {
      const config = {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            severity: {
              type: Type.STRING,
              description: 'CRITICAL, HIGH, MEDIUM, or LOW',
            },
            incidentType: {
              type: Type.STRING,
              description: 'Category: e.g., Naval Attack, Engine Failure, Fire, Piracy, Collision',
            },
            summary: {
              type: Type.STRING,
              description: 'One or two sentence operational situational summary',
            },
            injuries: {
              type: Type.INTEGER,
              description: 'Number of reported crew injuries, 0 if unknown/none',
            },
            fatalities: {
              type: Type.INTEGER,
              description: 'Number of reported fatalities, 0 if unknown/none',
            },
            missing: {
              type: Type.INTEGER,
              description: 'Number of missing crew, 0 if unknown/none',
            },
            damageEstimate: {
              type: Type.STRING,
              description: 'Severity description: e.g. Hull Breached, Propulsion Disabled, Superficial',
            },
            cargoAtRisk: {
              type: Type.BOOLEAN,
              description: 'True if cargo containment is compromised or in imminent hazard',
            },
            needsEvacuation: {
              type: Type.BOOLEAN,
              description: 'True if immediate search-and-rescue or crew evacuation is required',
            },
            recommendedAction: {
              type: Type.STRING,
              description: 'Tactical directive recommended to fleet command',
            },
            confidence: {
              type: Type.NUMBER,
              description: 'Confidence score from 0.0 to 1.0',
            },
          },
          required: [
            'severity',
            'incidentType',
            'summary',
            'injuries',
            'fatalities',
            'missing',
            'damageEstimate',
            'cargoAtRisk',
            'needsEvacuation',
            'recommendedAction',
            'confidence',
          ],
        },
      };

      const contents = `Analyze this maritime distress message from vessel ${shipName || 'unknown'}: "${text}".
Return strict JSON matching the schema. Assess damage, casualties, and urgency in the high-risk Strait of Hormuz conflict zone.`;

      let response: any = null;
      try {
        response = await this.ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config,
        });
      } catch (err38) {
        // Fallback to gemini-2.5-flash if 3.8 is unavailable for key
        try {
          response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config,
          });
        } catch (err25) {
          console.warn('Gemini API distress parsing failed, falling back to local NLP parser:', err25);
        }
      }

      if (response && response.text) {
        try {
          const rawJson = response.text.trim();
          const parsed = JSON.parse(rawJson);
          const validSeverity = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(parsed.severity)
            ? (parsed.severity as AlertPriority)
            : 'HIGH';

          return {
            severity: validSeverity,
            incidentType: parsed.incidentType || 'Maritime Emergency',
            summary: parsed.summary || text.slice(0, 120),
            injuries: Number(parsed.injuries) || 0,
            fatalities: Number(parsed.fatalities) || 0,
            missing: Number(parsed.missing) || 0,
            damageEstimate: parsed.damageEstimate || 'Unassessed',
            cargoAtRisk: Boolean(parsed.cargoAtRisk),
            needsEvacuation: Boolean(parsed.needsEvacuation),
            recommendedAction: parsed.recommendedAction || 'Standby for naval escort and assess status',
            confidence: Number(parsed.confidence) || 0.95,
            source: 'ai',
          };
        } catch (parseErr) {
          console.warn('Failed to parse Gemini response JSON:', parseErr);
        }
      }
    }

    // Fallback parser
    return this.fallbackKeywordParser(text);
  }

  private fallbackKeywordParser(text: string): DistressAnalysis {
    const lower = text.toLowerCase();

    // Critical keywords
    const isCritical =
      lower.includes('mayday') ||
      lower.includes('missile') ||
      lower.includes('explosion') ||
      lower.includes('torpedo') ||
      lower.includes('sinking') ||
      lower.includes('abandon ship') ||
      lower.includes('heavy casualties') ||
      lower.includes('boarding party') ||
      lower.includes('hijack');

    // High keywords
    const isHigh =
      isCritical ||
      lower.includes('attack') ||
      lower.includes('drone') ||
      lower.includes('fire') ||
      lower.includes('gunfire') ||
      lower.includes('breach') ||
      lower.includes('flooding') ||
      lower.includes('collision') ||
      lower.includes('dead') ||
      lower.includes('casualty') ||
      lower.includes('hostile');

    // Medium keywords
    const isMedium =
      isHigh ||
      lower.includes('engine') ||
      lower.includes('blackout') ||
      lower.includes('rudder') ||
      lower.includes('propulsion') ||
      lower.includes('smoke') ||
      lower.includes('leak') ||
      lower.includes('distress');

    const severity: AlertPriority = isCritical
      ? 'CRITICAL'
      : isHigh
      ? 'HIGH'
      : isMedium
      ? 'MEDIUM'
      : 'LOW';

    // Extract numbers of casualties/injuries via regex
    let injuries = 0;
    let fatalities = 0;
    let missing = 0;

    const injuryMatch = lower.match(/(\d+)\s*(?:crew|people|members)?\s*(?:injur|wound)/);
    if (injuryMatch) injuries = parseInt(injuryMatch[1], 10);

    const fatalMatch = lower.match(/(\d+)\s*(?:crew|people|members)?\s*(?:fatal|dead|killed|casualt)/);
    if (fatalMatch) fatalities = parseInt(fatalMatch[1], 10);

    const missingMatch = lower.match(/(\d+)\s*(?:crew|people|members)?\s*(?:missing|overboard)/);
    if (missingMatch) missing = parseInt(missingMatch[1], 10);

    // Incident type identification
    let incidentType = 'Operational Distress';
    if (lower.includes('missile') || lower.includes('drone') || lower.includes('attack')) {
      incidentType = 'Asymmetric Naval Strike';
    } else if (lower.includes('fire') || lower.includes('explosion')) {
      incidentType = 'Onboard Explosion / Fire';
    } else if (lower.includes('pirat') || lower.includes('board') || lower.includes('hijack')) {
      incidentType = 'Hostile Maritime Interception';
    } else if (lower.includes('engine') || lower.includes('blackout') || lower.includes('propulsion')) {
      incidentType = 'Propulsion & Power Failure';
    } else if (lower.includes('collision') || lower.includes('breach') || lower.includes('flooding')) {
      incidentType = 'Hull Damage / Ingress';
    }

    const needsEvacuation = isCritical || fatalities > 0 || injuries >= 3;
    const cargoAtRisk = isHigh || lower.includes('oil') || lower.includes('lng') || lower.includes('spill') || lower.includes('cargo');

    let recommendedAction = 'Maintain course and report updates';
    if (isCritical) {
      recommendedAction = 'Dispatch SAR helicopter & Naval Coalition asset; prepare lifeboats';
    } else if (isHigh) {
      recommendedAction = 'Divert to nearest sovereign territorial water (Sohar/Muscat) and request tug support';
    } else if (isMedium) {
      recommendedAction = 'Drop anchor or reduce headway; technical crew conduct emergency repairs';
    }

    return {
      severity,
      incidentType,
      summary: text.length > 140 ? text.slice(0, 137) + '...' : text,
      injuries,
      fatalities,
      missing,
      damageEstimate: isCritical ? 'Severe Structural Damage' : isHigh ? 'Moderate Operational Damage' : 'Minor/Contained',
      cargoAtRisk,
      needsEvacuation,
      recommendedAction,
      confidence: 0.88,
      source: 'fallback',
    };
  }
}
