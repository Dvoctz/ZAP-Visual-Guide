import { ShootEvent, Pose, OutfitContext, BrideOutfit, GroomOutfit, EnvironmentReference } from '../../types';

export interface ReferencePromptBuildInput {
  event: ShootEvent;
  pose: Pose;
  outfitContext?: OutfitContext;
  environment?: EnvironmentReference;
  customPromptOverride?: string;
}

export interface ReferencePromptBuildResult {
  prompt: string;
  negativeInstructions: string;
  metadata: {
    eventName: string;
    occasion: string;
    location: string;
    timeOfDay: string;
    mood: string;
    brideSummary: string;
    groomSummary: string;
    poseTitle: string;
    category: string;
    environmentName?: string;
    isCustomPrompt: boolean;
  };
}

/**
 * Derive intelligent default Bride outfit if not explicitly specified in outfitContext
 */
export function getEffectiveBrideOutfit(event: ShootEvent, customContext?: OutfitContext): BrideOutfit {
  if (customContext?.bride?.type && customContext?.bride?.color) {
    return customContext.bride;
  }
  if (event.outfitContext?.bride?.type && event.outfitContext?.bride?.color) {
    return event.outfitContext.bride;
  }

  const typeLower = (event.type === 'Custom' ? (event.customType || '') : event.type).toLowerCase();
  
  if (typeLower.includes('mehndi')) {
    return {
      type: 'Designer Lehenga / Anarkali',
      color: 'Pastel Peach & Sage Green',
      description: 'Embroidered silk lehenga with delicate zari work and visible intricate henna (mehndi) patterns on hands and forearms',
      dupatta: 'Lightweight organza dupatta draped naturally',
      jewellery: 'Floral and polki jewellery accents',
    };
  }
  if (typeLower.includes('haldi')) {
    return {
      type: 'Flowing Sharara / Lehenga',
      color: 'Marigold & Mustard Yellow',
      description: 'Festive lightweight yellow outfit suited for daytime ritual, adorned with subtle gold work',
      jewellery: 'Fresh floral jewellery (necklace, earrings, matha patti)',
    };
  }
  if (typeLower.includes('sangeet')) {
    return {
      type: 'Glamorous Concept Lehenga',
      color: 'Emerald Green & Sparkling Gold',
      description: 'Contemporary evening lehenga with shimmering sequins and structured flare',
      jewellery: 'Statement diamond / emerald necklace and earrings',
    };
  }
  if (typeLower.includes('wedding') || typeLower.includes('bridal')) {
    return {
      type: 'Regal Bridal Lehenga',
      color: 'Crimson Red & Antique Gold',
      description: 'Opulent bridal lehenga with royal zardozi embroidery, heavy border, and traditional elegance',
      dupatta: 'Double dupatta styling with sheer veil over head',
      jewellery: 'Royal uncut diamond choker, maang tikka, nath, and traditional bridal bangles (chooda)',
    };
  }
  if (typeLower.includes('reception')) {
    return {
      type: 'Haute-Couture Evening Lehenga / Gown',
      color: 'Champagne & Rose Gold',
      description: 'Modern structured reception attire with fine embellishments and elegant trailing drape',
      jewellery: 'Contemporary fine diamond jewellery',
    };
  }
  
  return {
    type: 'Designer Festive Lehenga',
    color: 'Pastel Peach & Gold',
    description: 'Contemporary luxury Indian festive attire with rich textures, elegant drape, and complementary color harmony',
    jewellery: 'Subtle polki and gold jewelry',
  };
}

/**
 * Derive intelligent default Groom outfit if not explicitly specified in outfitContext
 */
export function getEffectiveGroomOutfit(event: ShootEvent, customContext?: OutfitContext): GroomOutfit {
  if (customContext?.groom?.type && customContext?.groom?.color) {
    return customContext.groom;
  }
  if (event.outfitContext?.groom?.type && event.outfitContext?.groom?.color) {
    return event.outfitContext.groom;
  }

  const typeLower = (event.type === 'Custom' ? (event.customType || '') : event.type).toLowerCase();
  
  if (typeLower.includes('mehndi')) {
    return {
      type: 'Silk Kurta & Nehru Jacket',
      color: 'Mint Green & Ivory',
      description: 'Tailored raw silk kurta paired with an embroidered pastel Nehru vest and churidar',
    };
  }
  if (typeLower.includes('haldi')) {
    return {
      type: 'Linen / Silk Kurta',
      color: 'Mustard Yellow & White',
      description: 'Relaxed festive yellow kurta with subtle tonal texture',
    };
  }
  if (typeLower.includes('sangeet')) {
    return {
      type: 'Indo-Western Bandhgala',
      color: 'Midnight Navy & Black',
      description: 'Sharp asymmetric bandhgala jacket with metallic buttons and slim trousers',
    };
  }
  if (typeLower.includes('wedding') || typeLower.includes('groom')) {
    return {
      type: 'Royal Aristocratic Sherwani',
      color: 'Ivory & Gold',
      description: 'Hand-embroidered silk sherwani with matching embroidered stole (doshala) and safa (turban) with kalgi brooch',
      accessories: 'Layered pearl kantha necklace and embroidered mojari footwear',
    };
  }
  if (typeLower.includes('reception')) {
    return {
      type: 'Bespoke Tuxedo / Bandhgala',
      color: 'Classic Black / Deep Charcoal',
      description: 'Tailored black velvet bandhgala or bespoke black-tie suit with crisp styling',
    };
  }

  return {
    type: 'Tailored Sherwani / Kurta Jacket',
    color: 'Ivory & Soft Gold',
    description: 'Bespoke Indian groom wear with fine tailoring, subtle gold embroidery, and clean silhouette',
  };
}

/**
 * Derive Location Environmental Characteristics (no hallucinations, strictly realistic)
 */
export function getLocationNuance(location: string): string {
  const locLower = (location || '').toLowerCase();
  
  if (locLower.includes('stone town')) {
    return 'Historic Stone Town, Zanzibar setting: Authentic Swahili and Omani-Arabian architecture, sun-bleached coral-stone textured walls, intricately carved historic wooden doors with brass studs, narrow winding cobblestone alleyways, graceful archways, high balconies, and deep architectural light pockets.';
  }
  if (locLower.includes('beach') || locLower.includes('sea') || locLower.includes('ocean') || locLower.includes('shore') || locLower.includes('zanzibar')) {
    return 'Coastal Indian Ocean shoreline setting: Soft powdery sand, turquoise horizon, gentle sea breeze catching fabric drapes, organic limestone formations, and open coastal natural lighting.';
  }
  if (locLower.includes('arusha') || locLower.includes('moshi') || locLower.includes('safari') || locLower.includes('lodge')) {
    return 'East African luxury estate / lodge environment: Lush indigenous botanical gardens, acacia silhouettes, warm earth tones, wooden and stone veranda structures with distant mountain atmosphere.';
  }
  if (locLower.includes('dar es salaam') || locLower.includes('city') || locLower.includes('urban')) {
    return 'Modern coastal destination setting: Clean architectural lines, tropical greenery, elegant terrace spaces, and natural ambient light.';
  }

  return `Authentic on-location destination setting at ${location || 'destination venue'}. Real architectural textures, natural environmental interaction, true depth of field, and tangible ambient atmosphere.`;
}

/**
 * Derive Lighting & Time of Day Guidance
 */
export function getLightingNuance(timeOfDay: string): string {
  const tLower = (timeOfDay || '').toLowerCase();
  
  if (tLower.includes('golden') || tLower.includes('afternoon')) {
    return 'Warm directional golden hour sunlight, long cinematic shadows, luminous warm rim lighting on hair and clothing fabrics, and flattering golden skin highlights.';
  }
  if (tLower.includes('morning') || tLower.includes('sunrise') || tLower.includes('early')) {
    return 'Soft, clean directional morning sunlight with delicate shadow roll-off and fresh atmospheric clarity.';
  }
  if (tLower.includes('sunset') || tLower.includes('dusk')) {
    return 'Rich sunset glow with amber and soft rose tonal transitions across the sky, backlit subject separation, and ambient coastal fill.';
  }
  if (tLower.includes('blue hour') || tLower.includes('twilight')) {
    return 'Atmospheric blue hour twilight balanced with warm architectural ambient lighting and luminous subject highlights.';
  }
  if (tLower.includes('midday') || tLower.includes('noon')) {
    return 'Bright natural daylight with crisp contrast, using architectural shade pockets or soft bounce fill for flattering facial tones.';
  }
  if (tLower.includes('indoor') || tLower.includes('window')) {
    return 'Soft natural window light with dramatic shadow roll-off, soft ambient fill, and intimate directional contrast.';
  }

  return `Natural directional lighting matching ${timeOfDay || 'ambient conditions'}, with true-to-life highlight roll-off and balanced shadows.`;
}

export class ReferencePromptBuilder {
  /**
   * Builds a structured, photographic reference prompt based on event, pose, outfit context, and venue environment
   */
  static build(input: ReferencePromptBuildInput): ReferencePromptBuildResult {
    const { event, pose, outfitContext, environment, customPromptOverride } = input;

    const eventName = event.name || 'Destination Indian Wedding';
    const occasion = event.type === 'Custom' ? (event.customType || 'Couple Shoot') : event.type;
    const location = event.location || 'Stone Town, Zanzibar';
    const style = event.style || 'Cinematic, Romantic, Editorial';
    const timeOfDay = event.timeOfDay || 'Golden Hour';
    const description = event.description || '';

    const bride = getEffectiveBrideOutfit(event, outfitContext);
    const groom = getEffectiveGroomOutfit(event, outfitContext);
    const locationNuance = getLocationNuance(location);
    const lightingNuance = getLightingNuance(timeOfDay);

    const negativeInstructions =
      'generic pose, incorrect pose, looking at camera when directed away, standing still when directed to walk, Western wedding dress, random black tuxedo, extra people, extra limbs, deformed hands, bad fingers, duplicate people, incorrect anatomy, text, titles, numbers, captions, logos, watermarks, studio backdrop, white seamless, plastic skin, cartoon, 3D render, illustration, painting, fashion catalog stock photo.';

    // Construct full bride outfit text
    let brideText = `Indian bride wearing a ${bride.color} ${bride.type}`;
    if (bride.description) brideText += ` (${bride.description})`;
    if (bride.dupatta) brideText += `, with ${bride.dupatta}`;
    if (bride.jewellery) brideText += `, adorned with ${bride.jewellery}`;
    if (bride.stylingNotes) brideText += `. ${bride.stylingNotes}`;

    // Construct full groom outfit text
    let groomText = `Indian groom wearing a ${groom.color} ${groom.type}`;
    if (groom.description) groomText += ` (${groom.description})`;
    if (groom.accessories) groomText += `, with ${groom.accessories}`;
    if (groom.stylingNotes) groomText += `. ${groom.stylingNotes}`;

    // Pose specific mechanics breakdown
    const poseMechanics = `
- Pose Title: "${pose.title}"
- Sequence Category: "${pose.category || 'Intimate Connection'}"
- EXACT Client Direction: "${pose.clientDirection}"
- Photographer Compositional Concept: "${pose.photographerConcept}"
- Shooting Intent: "${pose.shootingIntent || 'Demonstrate precise pose posture, natural connection, and composition.'}"
- Emotional Mood: "${pose.mood || style}"`;

    const environmentSection = environment
      ? `=== 2. ACTUAL VENUE / ENVIRONMENT VISUAL GROUNDING (CRITICAL) ===
- ACTIVE VENUE ENVIRONMENT: "${environment.name}"
${environment.description ? `- Environment Context: ${environment.description}` : ''}
- MANDATORY VENUE PRESERVATION DIRECTIVE:
  * Use the supplied environment photograph as the primary visual reference for the location.
  * PRESERVE THE VISUAL IDENTITY OF THE SUPPLIED ENVIRONMENT: Maintain the recognizable architecture, furniture, decor, backdrops, floral installations, walls, floor, ceiling, and major lighting character.
  * Do NOT replace the venue with a generic environment. Adapt the couple's requested pose naturally to the actual space.`
      : `=== 2. ENVIRONMENT & LOCATION ===
- Location: ${location}
- Environmental Character: ${locationNuance}
- Venue / Setting Details: ${description || 'Authentic on-location destination session.'}
- Believable on-location environment with real depth, textured surfaces, and natural interaction.`;

    let generatedPrompt = `A professional destination wedding photography visual reference image created as an exact posing guide for a professional wedding photographer.

=== 1. CRITICAL POSE & BODY LANGUAGE (HIGHEST PRIORITY) ===
${poseMechanics}

POSE ACCURACY IS PARAMOUNT:
- The subjects MUST physically embody the exact body position, posture, hand placement, eye line, and physical interaction described in the Client Direction: "${pose.clientDirection}".
- If the direction specifies walking, show natural walking motion with forward momentum. If seated, show the exact seated posture. If hands are placed on shoulders, face, or holding hands, clearly show anatomically accurate hand positioning and finger placement.
- Do NOT convert this pose into a generic smiling-at-camera studio portrait. Faithfully execute the specific mechanics.

${environmentSection}

=== 3. EVENT & OUTFIT CONSISTENCY ===
- Event: ${eventName} (${occasion})
- Bride: ${brideText}. Preserve outfit type, main color, and cultural elegance.
- Groom: ${groomText}. Preserve outfit type, main color, and tailored fit.
- Cultural Authenticity: Authentic Indian wedding festive styling with natural fabric drape responding to movement and ambient air.

=== 4. LIGHTING & CAMERA CRAFT ===
- Time of Day: ${timeOfDay}
- Lighting Character: ${lightingNuance}
- Photographic Style: High-end editorial destination wedding photograph shot on 35mm / 85mm prime lens with natural shallow depth of field, sharp subject focus, organic skin texture, realistic hands, and cinematic tonal roll-off.

=== 5. STRICT NEGATIVE CONSTRAINTS ===
- Negative: ${negativeInstructions}`;

    // If user provided a custom prompt override, we use it for prompt output
    const isCustom = Boolean(customPromptOverride && customPromptOverride.trim().length > 0);
    const finalPrompt = isCustom ? (customPromptOverride as string).trim() : generatedPrompt;

    return {
      prompt: finalPrompt,
      negativeInstructions,
      metadata: {
        eventName,
        occasion,
        location,
        timeOfDay,
        mood: style,
        brideSummary: `${bride.color} ${bride.type}`,
        groomSummary: `${groom.color} ${groom.type}`,
        poseTitle: pose.title,
        category: pose.category || 'Intimate',
        environmentName: environment?.name,
        isCustomPrompt: isCustom,
      },
    };
  }
}
