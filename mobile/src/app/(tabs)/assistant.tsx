import { router } from 'expo-router';

import { PhaseCard } from '@/components/PhaseScreen';
import { Button, Notice, Screen, Title } from '@/components/ui';

/**
 * El asistente conversacional y el registro por voz son de la Fase 3.
 * Esta pantalla explica qué hará y no simula respuestas.
 */
export default function Assistant() {
  return (
    <Screen>
      <Title sub="Consulta y registra datos hablando">Asistente IA</Title>
      <Notice
        tone="warn"
        icon="construct"
        text="El asistente llegará en la Fase 3. Mientras tanto puedes buscar cualquier animal por su identificador."
      />
      <Button title="Buscar un animal por identificador" icon="search" variant="secondary" onPress={() => router.push('/identify/manual')} />
      <PhaseCard
        phase={3}
        title="Preguntas sobre tu explotación"
        icon="chatbubbles"
        items={['¿Cuántos animales tengo?', '¿Qué animales tienen vacunas pendientes?', '¿Cuánto he gastado en alimentación?', 'Responde solo con tus datos reales: nunca inventa cifras.']}
      />
      <PhaseCard
        phase={3}
        title="Registro por voz"
        icon="mic"
        items={['«Ha nacido un ternero macho de la vaca 245, pesa 42 kilos»', 'Transcribe, extrae los campos y los valida', 'Muestra una vista previa y pide confirmación antes de guardar']}
      />
    </Screen>
  );
}
