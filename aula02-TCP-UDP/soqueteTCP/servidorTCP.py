import socket


# Configuração do servidor
server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server_socket.bind(('localhost', 12345))
server_socket.listen(1)

print("Servidor TCP aguardando conexão...")

# Aceitando conexão do cliente
connection, addr = server_socket.accept()
print(f"Conexão estabelecida com {addr}")

# Recebendo dados do cliente
data = connection.recv(1024)
print(f"Mensagem recebida: {data.decode()}")

# Enviando resposta
connection.sendall("Mensagem recebida".encode())

connection.close()
server_socket.close()
