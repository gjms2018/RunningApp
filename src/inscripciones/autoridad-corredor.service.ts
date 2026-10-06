import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/**
 * Centraliza una regla que se repite en cualquier endpoint donde un
 * actor puede consultar/gestionar SU PROPIO historial o el de un
 * corredor menor bajo su tutela: "¿idUsuarioCorredorConsultado es el
 * propio actor, o está en su lista corredoresGestionados?".
 *
 * Antes vivía duplicada como método privado dentro de
 * InscripcionesController; se extrae aquí para que HistorialController
 * (y cualquier otro que la necesite a futuro) la reutilice sin
 * divergir en el criterio.
 */
@Injectable()
export class AutoridadCorredorService {
  resolver(
    idUsuarioCorredorConsultado: string | undefined,
    actor: JwtPayload,
  ): string {
    if (!idUsuarioCorredorConsultado) {
      return actor.idUsuario;
    }

    const esPropio = idUsuarioCorredorConsultado === actor.idUsuario;
    const esGestionado = actor.corredoresGestionados.includes(
      idUsuarioCorredorConsultado,
    );

    if (!esPropio && !esGestionado) {
      throw new ForbiddenException(
        'No tienes autoridad de tutor sobre este corredor',
      );
    }

    return idUsuarioCorredorConsultado;
  }
}
