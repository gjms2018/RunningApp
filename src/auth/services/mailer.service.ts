import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Envuelve el proveedor SMTP real (SendGrid o Amazon SES, según se
 * definió en la elección de tecnología) detrás de una interfaz simple.
 * Esto permite cambiar de proveedor sin tocar RecuperacionPasswordService,
 * y facilita mockear el envío de correos en pruebas automatizadas.
 *
 * La generación asíncrona (para no bloquear la respuesta HTTP mientras
 * se espera al proveedor SMTP) se resuelve encolando este envío con
 * BullMQ en vez de llamarlo de forma síncrona — aquí se muestra la
 * interfaz del servicio, no el worker de la cola.
 */
@Injectable()
export class MailerService {
  constructor(private configService: ConfigService) {}

  async enviarCorreoRecuperacion(
    email: string,
    tokenEnClaro: string,
  ): Promise<void> {
    const urlBase = this.configService.getOrThrow<string>('FRONTEND_URL');
    const enlace = `${urlBase}/restablecer-contrasena?token=${tokenEnClaro}`;

    // Aquí iría la llamada real al SDK de SendGrid/SES. Se deja como
    // contrato de la interfaz — el detalle de integración depende del
    // proveedor elegido en definitiva.
    await this.enviar({
      destinatario: email,
      asunto: 'Recuperación de contraseña',
      cuerpoHtml: `
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p><a href="${enlace}">Haz clic aquí para crear una nueva contraseña</a></p>
        <p>Este enlace expira en 1 hora. Si no solicitaste esto, ignora este correo.</p>
      `,
    });
  }

  private async enviar(params: {
    destinatario: string;
    asunto: string;
    cuerpoHtml: string;
  }): Promise<void> {
    // Placeholder de integración real (SendGrid/SES).
    // eslint-disable-next-line no-console
    console.log(`[Mailer] Enviando correo a ${params.destinatario}`);
  }
}
