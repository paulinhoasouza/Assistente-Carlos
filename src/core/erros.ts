/** Erro de regra/entrada do usuário; a mensagem já é amigável, em português. */
export class ErroUsuario extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroUsuario";
  }
}
