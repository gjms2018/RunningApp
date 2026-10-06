import { Body, Controller, Post, Req } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { UsuariosService } from './usuarios.service';
import { AuthService } from '../auth/services/auth.service';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';
import { CrearMenorDto } from './dto/crear-menor.dto';
import { RequestWithUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('usuarios')
export class UsuariosController {
  constructor(
    private usuariosService: UsuariosService,
    private authService: AuthService,
  ) {}

  /**
   * Autorregistro del corredor. Tras crear la cuenta, se emite el par
   * de tokens de una vez (mismo AuthService.emitirTokensPara que usa el
   * login) para no obligar al corredor a loguearse por separado
   * inmediatamente después de registrarse — mejor experiencia de uso.
   *
   * En este punto el payload emitido va con TODAS las listas de
   * alcance vacías (equiposRepresentados: [], organizadores: [],
   * patrocinadores: [], equiposMiembro: [], corredoresGestionados: []):
   * un usuario recién creado es, por definición, solo Corredor — sin
   * ninguna asignación de rol todavía. Eso es exactamente lo esperado.
   */
  @Public()
  @Post()
  async registrar(@Body() dto: RegistrarUsuarioDto) {
    const { idUsuario, email } = await this.usuariosService.registrar(dto);
    const tokens = await this.authService.emitirTokensPara(idUsuario, email);

    return {
      mensaje: 'Cuenta creada correctamente',
      idUsuario,
      ...tokens,
    };
  }

  /**
   * Crea la cuenta de un corredor MENOR de edad, gestionada por el
   * Tutor autenticado que hace la llamada. NO requiere @RequiereRol
   * porque la tutela no es una asignación de rol con alcance como
   * Representante/Organizador/Patrocinador — es una relación directa
   * en `usuarios.id_tutor`, validada dentro del propio servicio
   * (UsuariosService.validarPuedeSerTutor: debe ser una cuenta
   * autogestionada y mayor de 18 años).
   *
   * La cuenta resultante NUNCA lleva email ni password_hash — un menor
   * no puede legalmente tener credenciales propias, sin excepción. El
   * Tutor sigue actuando siempre con SU PROPIA sesión; el JWT del Tutor
   * incluirá este nuevo id_usuario en `corredoresGestionados` la
   * próxima vez que haga login o refresh.
   */
  @Post('menores')
  async crearMenor(@Body() dto: CrearMenorDto, @Req() request: RequestWithUser) {
    const resultado = await this.usuariosService.crearMenor(
      request.user.idUsuario,
      dto,
    );

    return {
      mensaje:
        'Cuenta de corredor menor creada. Aparecerá en tu lista de corredores gestionados después de volver a iniciar sesión o refrescar tu token.',
      ...resultado,
    };
  }
}
