// =============================================================================
// A5 · Subtítulos ficticios sincronizados con el tiempo de la emisión.
// cuesFor(sceneId, seed) → { at(t, lang) → string|null }
// Frases originales por tipo de escena, en español neutro e inglés.
// =============================================================================
const POOL = {
  football: [
    ['¡Atención, que llega el contragolpe por la banda izquierda!', 'Watch out, here comes the counterattack down the left!'],
    ['El balón se pasea por el área… ¡y despeja la defensa!', 'The ball drifts across the box… and the defense clears it!'],
    ['El estadio no deja de cantar ni un segundo.', 'The stadium hasn’t stopped singing for a second.'],
    ['Tarjeta amarilla. El árbitro no lo ha dudado.', 'Yellow card. The referee didn’t hesitate.'],
    ['¡Qué parada! El portero vuela hasta la escuadra.', 'What a save! The keeper flies into the top corner.'],
    ['Cambio en el Deportivo Cóndor: entra el número once.', 'Substitution for Deportivo Cóndor: number eleven comes on.'],
    ['[Público] ¡Olé, olé, olé!', '[Crowd] Olé, olé, olé!'],
    ['Saque de esquina. Todos los centrales suben a rematar.', 'Corner kick. Every defender pushes up for the header.'],
  ],
  news: [
    ['Buenas noches. Empezamos con la última hora.', 'Good evening. We begin with breaking news.'],
    ['El temporal deja lluvias intensas en buena parte del litoral.', 'The storm brings heavy rain to much of the coast.'],
    ['Conectamos en directo con nuestra corresponsal.', 'We go live to our correspondent.'],
    ['Los mercados cierran la jornada con ligeras subidas.', 'Markets close the day with slight gains.'],
    ['Mañana, cielos despejados en el interior y viento en la costa.', 'Tomorrow, clear skies inland and wind along the coast.'],
    ['Gracias por acompañarnos. Seguimos informando.', 'Thank you for joining us. We’ll keep you informed.'],
    ['La ciudad estrena hoy su nueva línea de tren ligero.', 'The city opens its new light-rail line today.'],
  ],
  ocean: [
    ['A doscientos metros, la luz del sol casi desaparece.', 'At two hundred meters, sunlight almost disappears.'],
    ['Estas medusas fabrican su propia luz para confundir a sus depredadores.', 'These jellyfish make their own light to confuse predators.'],
    ['Nadie había filmado este comportamiento hasta ahora.', 'No one had ever filmed this behavior until now.'],
    ['[Sonar] El sumergible desciende lentamente.', '[Sonar] The submersible slowly descends.'],
    ['Aquí abajo, cada caloría cuenta.', 'Down here, every calorie counts.'],
    ['La corriente trae nutrientes desde el fondo del cañón.', 'The current carries nutrients up from the canyon floor.'],
  ],
  cosmos: [
    ['Aurora a Control, ¿nos reciben?', 'Aurora to Control, do you read us?'],
    ['Silencio absoluto. Solo se oye el zumbido de los motores.', 'Total silence. Only the hum of the engines.'],
    ['La señal se repite cada once minutos exactos.', 'The signal repeats every eleven minutes exactly.'],
    ['— ¿Y si no es un mensaje? — Entonces es una advertencia.', '— What if it isn’t a message? — Then it’s a warning.'],
    ['Iniciando maniobra de inserción orbital.', 'Beginning orbital insertion maneuver.'],
    ['[Alarma] Presión de cabina estable. Continuamos.', '[Alarm] Cabin pressure stable. Proceeding.'],
    ['Desde aquí, la Tierra cabe detrás de un pulgar.', 'From here, Earth hides behind a thumb.'],
  ],
  nature: [
    ['Al amanecer, el valle despierta envuelto en niebla.', 'At dawn, the valley wakes wrapped in mist.'],
    ['Las águilas aprovechan las corrientes térmicas para ganar altura.', 'Eagles ride the thermals to gain altitude.'],
    ['En lo alto de la cordillera, la nieve nunca se derrite.', 'High in the range, the snow never melts.'],
    ['El deshielo alimenta los ríos que cruzan el bosque.', 'Meltwater feeds the rivers that cross the forest.'],
    ['[Viento] Un rebaño cruza el paso de montaña.', '[Wind] A herd crosses the mountain pass.'],
    ['Cada especie aquí ha aprendido a esperar.', 'Every species here has learned to wait.'],
  ],
  noir: [
    ['Llevo cuarenta años encendiendo esta luz. Nunca respondió nadie.', 'Forty years lighting this lamp. No one ever answered.'],
    ['— ¿Has oído eso? — Es solo el mar.', '— Did you hear that? — It’s just the sea.'],
    ['La tormenta no dejará salir a ningún barco esta noche.', 'The storm won’t let any ship out tonight.'],
    ['[Trueno] Alguien llama a la puerta.', '[Thunder] Someone knocks at the door.'],
    ['Ese barco se hundió antes de que yo naciera.', 'That ship sank before I was born.'],
    ['Si apagas el faro, vendrán a buscarte.', 'If you turn off the light, they’ll come for you.'],
  ],
  racing: [
    ['¡Salida limpia! Todos entran juntos en la primera curva.', 'Clean start! They all go into turn one together.'],
    ['Neumáticos al límite en el tramo helado.', 'Tyres on the limit through the icy stage.'],
    ['Le saca tres décimas en el último sector.', 'Three tenths faster in the final sector.'],
    ['[Motor] Adelantamiento por el exterior… ¡increíble!', '[Engine] Overtake around the outside… incredible!'],
    ['Cambio de ruedas en menos de tres segundos.', 'Tyre change in under three seconds.'],
    ['Última vuelta. Todo se decide aquí.', 'Final lap. It all comes down to this.'],
  ],
  kids: [
    ['¡Hola, amigos! ¿Listos para saltar?', 'Hi, friends! Ready to jump?'],
    ['— ¡Pip, cuidado con la torre! — ¡Uy!', '— Pip, watch the tower! — Oops!'],
    ['Uno, dos, tres… ¡arriba!', 'One, two, three… up!'],
    ['Lola ha encontrado un bloque de un color nuevo.', 'Lola found a block of a brand-new color.'],
    ['[Risas] ¡Otra vez, otra vez!', '[Laughter] Again, again!'],
    ['Juntos llegamos más alto.', 'Together we reach higher.'],
  ],
  music: [
    ['♪ Aunque la noche se apague, yo sigo aquí ♪', '♪ Even if the night goes dark, I’m still here ♪'],
    ['¡Buenas noches! ¡Gracias por venir!', 'Good night! Thank you for coming!'],
    ['Esta canción la escribimos en una sola tarde.', 'We wrote this song in a single afternoon.'],
    ['♪ Dame una señal, solo una más ♪', '♪ Give me a sign, just one more ♪'],
    ['[Aplausos] ¡Otra! ¡Otra!', '[Applause] Encore! Encore!'],
    ['Son las tres y catorce. Línea abierta, te escucho.', 'It’s three fourteen. The line is open, I’m listening.'],
  ],
  fantasy: [
    ['Las luciérnagas solo brillan para quien sabe mirar.', 'Fireflies only glow for those who know how to look.'],
    ['— ¿Dónde estamos? — En el lugar que nadie recuerda.', '— Where are we? — In the place no one remembers.'],
    ['No sueltes mi mano: el sendero cambia de forma.', 'Don’t let go of my hand: the path changes shape.'],
    ['[Música suave] El bosque guarda silencio.', '[Soft music] The forest falls silent.'],
    ['Mamá decía que aquí vivían los recuerdos.', 'Mom used to say memories lived here.'],
    ['Si cierras los ojos, puedes oírlas cantar.', 'If you close your eyes, you can hear them sing.'],
  ],
};

const PERIOD = 6.5;   // s entre inicios de frase
const LEN = 3.6;      // s en pantalla
const OFFSET = 4;     // primer subtítulo

export function cuesFor(sceneId, seed = 1) {
  const pool = POOL[sceneId] || POOL.noir;
  const s = Math.abs(seed | 0);
  return {
    at(t, lang = 'es') {
      if (t < OFFSET) return null;
      const i = Math.floor((t - OFFSET) / PERIOD);
      // pequeña variación determinista de la duración/inicio
      const jitter = ((i * 2654435761 + s) >>> 0) % 1000 / 1000;
      const start = OFFSET + i * PERIOD + jitter * 0.8;
      const len = LEN - 0.6 + jitter * 1.2;
      if (t < start || t > start + len) return null;
      // Algunos huecos sin diálogo
      if (((i + s) % 7) === 5) return null;
      const pair = pool[(i * 5 + s) % pool.length];
      return lang === 'en' ? pair[1] : pair[0];
    },
  };
}

export const SUB_LANGS = { off: 'Desactivados', es: 'Español', en: 'Inglés' };
export const AUDIO_LANGS = { es: 'Español', en: 'Inglés', lat: 'Español latino' };
