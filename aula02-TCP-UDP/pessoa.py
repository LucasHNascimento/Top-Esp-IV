# Scrpt de POO com classe Pessoa
class Pessoa:
	def __init__(self, nome, idade):
		self.nome = nome
		self.idade = idade

	def apresentar(self):
		print(f"Meu nome é {self.nome} e eu tenho {self.idade} anos.")

# Criando um objeto Pessoa
pessoa1 = Pessoa("Rafael", 33)
pessoa1.apresentar()
