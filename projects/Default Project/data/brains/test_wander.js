/**
 * Auto-generated Brain Script
 * Generated: 2026-02-05T19:00:00.000Z
 */

export async function* runBehavior(npc, game, system) {
  // Initialize
  yield;
  
  // Main behavior loop
  while (true) {
    await npc.say("Greetings, traveler!");
    yield;
    await npc.wander(150, 3);
    yield;
    await npc.wait(2);
    yield;

    yield; // Allow game loop to continue
  }
}
