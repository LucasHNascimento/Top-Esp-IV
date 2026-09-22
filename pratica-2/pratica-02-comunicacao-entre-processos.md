# Prática 02: comunicação entre processos através da fronteira de máquina

**Disciplina:** Tópicos Especiais IV (Computação Distribuída)
**Curso:** Bacharelado em Sistemas de Informação, UNIPAM

Esta prática dá continuidade a dois encontros anteriores. No primeiro deles, os programas de
soquete em TCP e em UDP foram executados no ambiente de nuvem, com o cliente e o servidor no mesmo
computador. No segundo, depois que as máquinas virtuais foram criadas, a aplicação e o banco de
dados passaram a executar em máquinas distintas, e a comunicação entre elas atravessou uma rede.

Aqui os dois assuntos se encontram. Os mesmos programas de soquete, sem alteração de lógica,
passam a executar em máquinas diferentes. O que a aula de soquetes tratou como configuração, que é
o endereço para onde o cliente aponta e o endereço em que o servidor escuta, torna-se o centro da
prática, porque é exatamente ali que a fronteira de máquina se manifesta.

---

## Sumário

| Seção | Assunto |
|---|---|
| Quadro de referência | endereços, portas, diretórios e comandos, para consulta rápida |
| 1 | Por que esta prática existe |
| 2 | Fundamentação técnica |
| 3 | Preparação do ambiente |
| 4 | Primeiro degrau, o fluxo com o protocolo TCP |
| 5 | Primeiro degrau, segunda parte, o datagrama com o protocolo UDP |
| 6 | Segundo degrau, a chamada remota de procedimento |
| 7 | Terceiro degrau, o que já estava no ar |
| 8 | Síntese |
| 9 | Referência de comandos |
| 10 | Diagnóstico de falhas |
| 11 | Apêndice com o conteúdo integral dos arquivos |

---

## Objetivos de aprendizagem

Ao final desta prática o aluno deve ser capaz de:

- Explicar o que o nome `localhost` designa e por que ele nunca se refere a outra máquina
- Distinguir o endereço para o qual um cliente aponta do endereço em que um servidor escuta, e
  reconhecer que são duas decisões independentes
- Justificar a escuta em `0.0.0.0` a partir do comportamento observado, e não por convenção
- Comparar o modo como o protocolo TCP e o protocolo UDP informam uma falha, e relacionar cada um
  aos modelos de falha estudados
- Explicar por que um tempo limite é necessário em uma comunicação sem conexão, e o que ele resolve
- Construir a travessia de uma chamada de procedimento remoto entre duas máquinas e identificar o
  papel do stub
- Reconhecer, em três formas distintas de comunicação, o que cada camada adicional passou a
  resolver e o que ela escondeu

---

## Quadro de referência

**As máquinas, já em funcionamento desde a prática anterior**

| Papel | Nome | Endereço na rede exclusiva de hospedeiro |
|---|---|---|
| serviço | `banco` | 192.168.56.101 |
| cliente | `aplicacao` | 192.168.56.102 |
| terminal e navegador | hospedeira | 192.168.56.1 |

**As portas desta prática**

| Porta | Protocolo | Onde escuta | Papel |
|---|---|---|---|
| 12345 | TCP | máquina `banco` | serviço de eco por fluxo |
| 12345 | UDP | máquina `banco` | serviço de eco por datagrama |
| 8000 | TCP | máquina `banco` | serviço de chamada remota |
| 3000 | TCP | máquina `aplicacao` | aplicação web, já em funcionamento |

As portas 12345 em TCP e em UDP não conflitam entre si. São protocolos distintos, e cada um possui
o seu próprio conjunto de portas.

**Os diretórios de trabalho**

| Máquina | Caminho |
|---|---|
| `banco` | `/home/SEU_USUARIO/soquetes` |
| `aplicacao` | `/home/SEU_USUARIO/soquetes` |

**Sequência mínima de verificação, antes de começar**

```bash
ssh SEU_USUARIO@192.168.56.101     # terminal da maquina banco
ssh SEU_USUARIO@192.168.56.102     # terminal da maquina aplicacao
```

---

## 1. Por que esta prática existe

### 1.1 Onde a aula de soquetes parou

Na aula de soquetes, que abriu esta sequência, os quatro programas foram executados no ambiente de
nuvem, com o servidor em uma aba do terminal e o cliente em outra. Os dois processos conversaram, a mensagem chegou e a resposta
voltou.

Os dois processos, no entanto, estavam na mesma máquina. Compartilhavam o mesmo sistema
operacional, a mesma pilha de rede e a mesma noção de `localhost`. A comunicação ocorreu, mas ela
não atravessou coisa alguma.

Isso tem uma consequência que a aula não pôde mostrar. Em uma máquina só, nada se perde, nada
demora e nada fica em silêncio. A diferença entre o protocolo TCP e o protocolo UDP ficou como
afirmação de que um é confiável e o outro não é, sem que nenhum dos dois tivesse a oportunidade de
provar isso.

### 1.2 O que a prática das duas máquinas já mostrou

Na prática anterior, o navegador da máquina hospedeira alcançou a aplicação que executa dentro de
uma máquina virtual. Para que isso funcionasse, foi criada uma regra de redirecionamento de porta
no VirtualBox, associando uma porta da máquina hospedeira ao endereço e à porta da máquina virtual.

Vale reter o que essa regra realmente faz. Ela não tornou as duas máquinas a mesma máquina. Ela
instalou um tradutor entre elas, e é o tradutor que atende no endereço local e encaminha para o
endereço remoto. O nome `localhost` continuou designando a máquina de quem chama, e funcionou
porque alguém construiu, nessa máquina, uma porta que leva até a outra.

Entre as duas máquinas virtuais não existe regra nenhuma desse tipo. As regras criadas ligam a
máquina hospedeira às máquinas virtuais, e não uma máquina virtual à outra. É por isso que a
travessia desta prática precisa nomear o destino.

### 1.3 Os três degraus

A mesma ideia, que é um processo pedir alguma coisa a outro processo em outra máquina, aparece aqui
em três formas, com camadas crescentes entre quem chama e quem atende.

No **primeiro degrau** o aluno abre o soquete, escreve os bytes, escolhe o formato da mensagem e
trata a resposta por conta própria. Nada além do sistema operacional participa. Esse degrau é
percorrido duas vezes, uma com o protocolo TCP e outra com o protocolo UDP, e é a diferença entre
as duas passagens que interessa.

No **segundo degrau** o aluno chama uma função com nome e assinatura. O empacotamento dos
argumentos, o transporte e o desempacotamento da resposta passam a ser executados por uma camada
intermediária, e a rede desaparece do código de quem chama.

No **terceiro degrau** o aluno não escreve nada. Ele observa a aplicação que já está em
funcionamento desde a prática anterior, em que o enquadramento das mensagens, o método, o formato
dos dados e o código de resultado já vieram resolvidos por outra pessoa.

A sequência importa. Percorrer o degrau de baixo antes de usar os de cima é o que transforma a
abstração em um conjunto de decisões que alguém tomou, em lugar de um recurso que simplesmente
existe.

### 1.4 O que cada etapa demonstra

| Etapa | Conceito | Item do conteúdo programático |
|---|---|---|
| A recusa do cliente apontado para si mesmo | endereço, e a ausência de espaço de endereços comum | 2.1 |
| A recusa com o servidor preso ao endereço interno | ponto de extremidade, e onde um serviço escuta | 2.1 |
| O terminal pendurado em UDP | falha por omissão, e a diferença entre recusa e silêncio | 1.3 |
| O tempo limite no cliente UDP | detecção de falha na ausência de aviso | 1.3 e 2.4 |
| A chamada remota atravessando duas máquinas | chamada de procedimento remoto, stub e transparência de localização | 2.3 |
| A comparação final entre os três degraus | categorias de middleware, e contrato de serviço | 1.4 |
| A leitura da aplicação já em funcionamento | comunicação com contrato sobre HTTP | 2.5 |

---

## 2. Fundamentação técnica

### 2.1 O que o nome localhost designa

O nome `localhost` resolve para o endereço 127.0.0.1, que pertence a uma interface especial
presente em toda máquina, chamada interface de retorno. O tráfego enviado a esse endereço não
chega a sair da máquina. Ele desce até a pilha de rede e volta.

Disso decorre uma propriedade que costuma passar despercebida enquanto tudo executa em um mesmo
computador. O nome `localhost` não é ambíguo, e também não é relativo ao contexto. Ele é sempre
correto e sempre se refere a quem o pronuncia. Quando o cliente na máquina `aplicacao` procura
`localhost`, ele procura a máquina `aplicacao`, e o fato de existir um servidor na máquina `banco`
é irrelevante.

Essa é a razão pela qual não existe espaço de endereços comum em um sistema distribuído. Cada
máquina possui a sua própria noção de si mesma, e nenhuma delas coincide com a das outras. Referir
a outra máquina exige sempre nomeá-la.

### 2.2 O endereço em que um serviço escuta

A operação de vinculação, executada pela chamada `bind`, informa ao sistema operacional em qual
endereço local e em qual porta o servidor deseja receber conexões. É uma decisão independente
daquela tomada pelo cliente, e as duas precisam ser compatíveis para que a comunicação ocorra.

Um servidor vinculado a 127.0.0.1 só recebe o que chega pela interface de retorno, ou seja, só é
alcançável por processos da própria máquina. Um servidor vinculado a 0.0.0.0 recebe o que chega por
qualquer interface da máquina, inclusive a da rede que liga as máquinas virtuais.

Convém observar que 0.0.0.0 não é um endereço de destino. Nenhum cliente aponta para ele. Ele é
apenas a forma de dizer, na vinculação, que nenhuma interface está excluída.

Esta é a quarta vez que a exigência aparece no semestre. Ela já foi encontrada no servidor da
aplicação, que escuta em 0.0.0.0 dentro do contêiner, e nas verificações de porta da prática
anterior. A diferença é que aqui ela aparece em um programa escrito e editado pelo próprio aluno.

### 2.3 Recusa e silêncio

Quando um cliente TCP tenta conectar a um endereço e a uma porta em que nada escuta, e a máquina de
destino é alcançável, o sistema operacional dessa máquina responde com uma recusa explícita. O
cliente recebe essa recusa e falha de imediato, informando o motivo. A tentativa de conexão é, ela
própria, um mecanismo de verificação.

Quando um cliente UDP envia um datagrama para um endereço e uma porta em que nada escuta, não há
tentativa de conexão a recusar. O datagrama parte e o cliente fica aguardando uma resposta que
nunca será enviada. Nenhum erro é reportado, e o programa permanece bloqueado na chamada de
recepção.

São dois modelos de falha distintos, e a diferença entre eles não está no defeito, que é o mesmo em
ambos os casos, mas na informação que o protocolo entrega a quem chamou. Um deles avisa. O outro
não tem como avisar, e por isso a responsabilidade de desistir passa a ser de quem chamou.

### 2.4 A chamada remota e o stub

Na chamada de procedimento remoto, quem chama escreve uma invocação com nome e assinatura, como se
o procedimento executasse localmente. Entre essa invocação e a rede existe uma peça intermediária,
chamada stub, que empacota os argumentos em uma mensagem, transmite, aguarda, recebe a resposta e a
desempacota, devolvendo o resultado a quem chamou.

Do lado do serviço existe a peça simétrica, que desempacota a requisição, executa o procedimento
correspondente, empacota o resultado e o devolve.

O mecanismo é o do diagrama apresentado em aula. O que esta prática acrescenta é que as duas
metades passam a executar em máquinas diferentes, de modo que o trecho identificado no diagrama
como rede deixa de ser um desenho.

---

## 3. Preparação do ambiente

### 3.1 O que precisa estar de pé

As duas máquinas virtuais da prática anterior, ligadas, com os endereços já fixados na rede
exclusiva de hospedeiro e com o servidor de acesso remoto ativo. Nenhuma máquina nova é criada e
nada é instalado.

A aplicação web e o banco de dados podem permanecer em execução. Eles não interferem nesta prática,
e são retomados na seção 7.

### 3.2 As duas sessões remotas

Na máquina hospedeira, abrir dois terminais. Em um deles:

```bash
ssh SEU_USUARIO@192.168.56.101
```

No outro:

```bash
ssh SEU_USUARIO@192.168.56.102
```

Convém identificar cada terminal, porque a prática inteira consiste em observar o que acontece
quando um fala com o outro. Confundir as duas sessões é a causa mais frequente de confusão nesta
prática.

Para confirmar em qual máquina cada sessão está:

```bash
hostname -I
```

O primeiro endereço apresentado deve ser 192.168.56.101 na sessão do serviço e 192.168.56.102 na
sessão do cliente.

### 3.3 Conferir o Python

Em cada uma das duas sessões:

```bash
python3 -V
```

O interpretador já vem instalado no sistema das máquinas virtuais, e todos os módulos utilizados
nesta prática pertencem à biblioteca padrão. Nada é obtido da internet e nada é instalado.

### 3.4 Criar o diretório de trabalho

Em cada uma das duas sessões:

```bash
mkdir -p ~/soquetes
cd ~/soquetes
```

O procedimento de criação de arquivos com o editor de terminal é o mesmo da prática anterior, e
está detalhado na seção 4 daquele roteiro. Os quatro cuidados ao colar continuam valendo.

---

## 4. Primeiro degrau, o fluxo com o protocolo TCP

### 4.1 Criar os arquivos

Os dois programas são os mesmos executados no ambiente de nuvem, sem alteração. O conteúdo integral
está na seção 11.

Na sessão da máquina **`banco`**:

```bash
cd ~/soquetes
nano servidorTCP.py
```

Colar o conteúdo do arquivo `servidorTCP.py` da seção 11.1, gravar e sair.

Na sessão da máquina **`aplicacao`**:

```bash
cd ~/soquetes
nano clienteTCP.py
```

Colar o conteúdo do arquivo `clienteTCP.py` da seção 11.2, gravar e sair.

Conferir o que foi gravado, em cada máquina:

```bash
cat servidorTCP.py
```

```bash
cat clienteTCP.py
```

### 4.2 Primeira execução

Na sessão da máquina `banco`, iniciar o serviço:

```bash
python3 servidorTCP.py
```

A saída esperada é:

```
Servidor TCP aguardando conexões...
```

O terminal permanece ocupado. Isso é o comportamento correto, porque o processo está bloqueado na
chamada de aceitação, aguardando que alguém procure por ele.

Na sessão da máquina `aplicacao`, executar o cliente:

```bash
python3 clienteTCP.py
```

### 4.3 A recusa, e o que ela informa

O cliente encerra de imediato, com uma mensagem semelhante a esta:

```
ConnectionRefusedError: [Errno 111] Connection refused
```

**Antes de corrigir, responder.** O serviço está em execução, na porta correta, e a mensagem diz
que a conexão foi recusada. Quem recusou.

A resposta está na única linha do cliente que informa um destino:

```python
client_socket.connect(('localhost', 12345))
```

O cliente executa na máquina `aplicacao`, e nela `localhost` é a própria máquina `aplicacao`. Foi
lá que ele procurou, e é lá que não existe serviço algum na porta 12345. Quem recusou foi o sistema
operacional da máquina em que o próprio cliente executa.

A observação que interessa é que o programa não está errado. Ele executou corretamente no ambiente
de nuvem, com a mesma linha. O que mudou foi que as duas pontas deixaram de ser a mesma máquina, e
o nome que antes servia às duas agora serve apenas a uma.

### 4.4 Corrigir o endereço do cliente

Na máquina `aplicacao`:

```bash
nano clienteTCP.py
```

Alterar a linha de conexão, substituindo o nome pelo endereço da máquina que hospeda o serviço:

```python
client_socket.connect(('192.168.56.101', 12345))
```

Gravar, sair e executar novamente:

```bash
python3 clienteTCP.py
```

### 4.5 A segunda recusa, com a mesma mensagem e outra causa

O cliente falha novamente, e com a mesma mensagem:

```
ConnectionRefusedError: [Errno 111] Connection refused
```

**A mensagem é idêntica e a causa é outra.** Na primeira vez o pedido nem saiu da máquina do
cliente. Agora ele saiu, atravessou a rede, chegou à máquina `banco` e foi recusado lá.

O motivo está na linha de vinculação do servidor:

```python
server_socket.bind(('localhost', 12345))
```

O servidor pediu ao sistema operacional para receber apenas o que chega pela interface de retorno
da máquina `banco`. O pedido do cliente chegou por outra interface, a da rede que liga as duas
máquinas, e para essa interface não há ninguém escutando na porta 12345.

Vale reter que uma mesma mensagem de erro pode corresponder a causas distintas, e que distinguir
qual delas ocorreu exige saber de onde o pedido partiu e onde ele foi recusado. Essa dificuldade é
própria dos sistemas distribuídos e reaparece ao longo da disciplina.

### 4.6 Corrigir o endereço de escuta do servidor

Na máquina `banco`, interromper o servidor com `Ctrl+C` e editar:

```bash
nano servidorTCP.py
```

Alterar a linha de vinculação:

```python
server_socket.bind(('0.0.0.0', 12345))
```

Gravar, sair e iniciar novamente:

```bash
python3 servidorTCP.py
```

### 4.7 O endereço já em uso

A partir do momento em que o servidor atender o primeiro cliente, uma interrupção seguida de
reinício imediato pode ser recusada, com esta mensagem:

```
OSError: [Errno 98] Address already in use
```

Convém saber de antemão quando isso acontece e quando não acontece. Até aqui nenhuma conexão foi
estabelecida, porque as duas tentativas do cliente terminaram em recusa, e por isso o reinício da
seção 4.6 não encontra obstáculo. O impedimento surge depois da seção 4.8, quando já houve conversa
completa e o servidor foi quem fechou a conexão.

A causa é o estado de encerramento em que o soquete permanece do lado que fechou primeiro. O
sistema operacional preserva a porta durante esse período, de modo a não entregar a um processo
novo o que ainda pertence a uma conversa antiga. Na máquina do serviço, o estado é visível:

```bash
ss -tan | grep 12345
```

```
TIME-WAIT 0  0  192.168.56.101:12345  192.168.56.102:49850
```

**A saída imediata é esperar.** O estado dura cerca de um minuto, e passado esse prazo a porta é
liberada sozinha. Não há comando a executar.

Para que a situação não se repita nos reinícios seguintes, acrescentar a linha destacada,
imediatamente após a criação do soquete e antes da vinculação. Na máquina `banco`:

```bash
nano servidorTCP.py
```

```python
server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server_socket.bind(('0.0.0.0', 12345))
```

**Atenção.** Essa linha não libera a porta que já está retida. O sistema operacional só dispensa a
verificação quando o soquete em encerramento e o soquete novo declaram, ambos, que aceitam a
reutilização, e o soquete retido herdou a declaração do servidor que o criou. Acrescentar a linha e
reiniciar em seguida produz o mesmo `Errno 98`. O efeito aparece do ciclo seguinte em diante, quando
o servidor que deixou a porta retida já estava executando com ela.

Esta linha existe na versão comentada dos programas apresentada em aula, e a razão de ela existir é
a que acabou de ser observada.

### 4.8 A execução completa

Com o servidor em execução na máquina `banco`, executar o cliente na máquina `aplicacao`:

```bash
python3 clienteTCP.py
```

Na máquina `aplicacao`:

```
Resposta do servidor: Mensagem recebida
```

Na máquina `banco`:

```
conexão estabelecida com ('192.168.56.102', 54321).
Mensagem recebida: Olá, servidor!
```

O número da porta apresentado varia a cada execução, e a seção seguinte trata disso.

### 4.9 Quem chegou, visto pelo servidor

O servidor apresenta o endereço e a porta de quem o procurou. O endereço é o da máquina
`aplicacao`, o que confirma que o pedido atravessou a rede. A porta é um número alto, escolhido
pelo sistema operacional do cliente no momento da conexão, e diferente a cada execução.

Executar o cliente três vezes seguidas e registrar as três portas apresentadas pelo servidor.

Isso evidencia que uma conexão é identificada por quatro valores, e não por um. São o endereço e a
porta de origem, e o endereço e a porta de destino. A porta fixa, conhecida de antemão, é apenas a
do lado que atende, porque é preciso que alguém saiba onde procurar. O lado que procura não precisa
de porta previsível, e por isso recebe uma qualquer que esteja livre.

---

## 5. Primeiro degrau, segunda parte, o datagrama com o protocolo UDP

### 5.1 Criar os arquivos

Interromper o servidor TCP na máquina `banco`, com `Ctrl+C`.

Na sessão da máquina **`banco`**:

```bash
cd ~/soquetes
nano servidorUDP.py
```

Colar o conteúdo da seção 11.3, gravar e sair.

Na sessão da máquina **`aplicacao`**:

```bash
cd ~/soquetes
nano clienteUDP.py
```

Colar o conteúdo da seção 11.4, gravar e sair.

Os dois arquivos vêm com o endereço original, `localhost`, deliberadamente. O percurso desta seção
é o mesmo da anterior, e a diferença está no que cada protocolo informa em cada etapa.

### 5.2 O terminal que não volta

Na máquina `banco`:

```bash
python3 servidorUDP.py
```

```
Servidor UDP aguardando mensagem...
```

Na máquina `aplicacao`:

```bash
python3 clienteUDP.py
```

**Nada acontece.** Não há mensagem de erro, não há recusa e o comando não retorna. O terminal fica
ocupado por tempo indeterminado.

Aguardar algum tempo antes de prosseguir, para que a ausência de resposta seja observada, e então
interromper com `Ctrl+C`.

A causa é a mesma da seção 4.3. O cliente enviou o datagrama para `localhost`, que na máquina
`aplicacao` é a própria máquina `aplicacao`, e ali não há serviço algum na porta 12345. A diferença
está inteiramente na consequência. Em TCP, o erro apareceu de imediato e nomeou o problema. Em UDP,
o datagrama partiu, o programa passou a aguardar uma resposta e nenhum aviso foi produzido.

Esta é a demonstração que a aula de soquetes não pôde dar. Com as duas pontas na mesma máquina, todo
datagrama chegava, e a afirmação de que o protocolo não é confiável permanecia sem evidência.

### 5.3 Corrigir o endereço do cliente

Na máquina `aplicacao`:

```bash
nano clienteUDP.py
```

```python
client_socket.sendto("Olá, servidor!".encode(), ('192.168.56.101', 12345))
```

Gravar, sair e executar novamente.

### 5.4 O silêncio outra vez

O comportamento se repete. O terminal permanece ocupado e nenhum erro é apresentado.

O motivo é o mesmo da seção 4.5, pois o servidor continua vinculado a `localhost` na máquina
`banco`. A diferença, novamente, está na informação. Em TCP, a mesma situação produziu uma recusa
explícita. Em UDP, o pedido chegou à máquina de destino, foi descartado por não haver destinatário,
e quem enviou continua esperando.

Interromper com `Ctrl+C` e prosseguir.

### 5.5 Corrigir o endereço de escuta do servidor

Na máquina `banco`, interromper o servidor e editar:

```bash
nano servidorUDP.py
```

```python
server_socket.bind(('0.0.0.0', 12345))
```

Gravar, sair e iniciar novamente. Executar o cliente na máquina `aplicacao`.

Na máquina `aplicacao`:

```
Resposta do servidor: Mensagem recebida
```

Na máquina `banco`:

```
Mensagem recebida: Olá, servidor! de ('192.168.56.102', 49152)
```

**O servidor encerra após atender um único datagrama.** Isso é o comportamento deste programa, que
não possui laço de repetição, e é aproveitado na seção seguinte.

### 5.6 O tempo limite

Com o servidor já encerrado pela execução anterior, executar o cliente novamente na máquina
`aplicacao`:

```bash
python3 clienteUDP.py
```

O terminal fica ocupado outra vez. O serviço não existe mais, e o cliente não tem como saber disso.

Interromper com `Ctrl+C`.

A única saída é o cliente estabelecer, por conta própria, quanto tempo está disposto a esperar. Na
máquina `aplicacao`:

```bash
nano clienteUDP.py
```

Acrescentar a definição do tempo limite após a criação do soquete, e envolver a recepção em
tratamento de exceção, de modo que o arquivo fique assim:

```python
import socket

client_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
client_socket.settimeout(5)

try:
    client_socket.sendto("Olá, servidor!".encode(), ('192.168.56.101', 12345))
    data, server = client_socket.recvfrom(1024)
    print(f"Resposta do servidor: {data.decode()}")
except socket.timeout:
    print("Nenhuma resposta em 5 segundos.")
finally:
    client_socket.close()
```

Gravar, sair e executar, ainda com o servidor encerrado:

```
Nenhuma resposta em 5 segundos.
```

O programa agora desiste e informa. Convém observar com precisão o que ele passou a saber e o que
continua sem saber. Ele sabe que não obteve resposta dentro do prazo que ele próprio estabeleceu.
Ele continua sem saber se o pedido não chegou, se chegou e o serviço não existia, se o serviço
existia e demorou, ou se a resposta se perdeu no caminho de volta.

Essa incerteza não é uma limitação deste programa. Ela é a situação normal de quem espera resposta
pela rede, e é o ponto de partida da prática seguinte, sobre semânticas de entrega e idempotência.

### 5.7 Comparação entre as duas falhas

Reiniciar o servidor UDP na máquina `banco` e executar o cliente para confirmar o funcionamento.

Preencher o quadro a seguir com o que foi observado, e não com o que se espera de cada protocolo.

| Situação | TCP | UDP |
|---|---|---|
| Cliente apontado para si mesmo | | |
| Servidor vinculado à interface de retorno | | |
| Serviço inexistente no momento da chamada | | |
| Como o programa soube que havia um problema | | |
| Quem decidiu desistir | | |

---

## 6. Segundo degrau, a chamada remota de procedimento

### 6.1 Criar os arquivos

Na sessão da máquina **`banco`**:

```bash
cd ~/soquetes
nano servidorRPC.py
```

Colar o conteúdo da seção 11.5, gravar e sair.

Na sessão da máquina **`aplicacao`**:

```bash
cd ~/soquetes
nano clienteRPC.py
```

Colar o conteúdo da seção 11.6, gravar e sair.

Os dois utilizam o módulo `xmlrpc`, que pertence à biblioteca padrão do Python. Nada é instalado.

### 6.2 As duas mudanças

Antes de executar, identificar nos dois arquivos as linhas equivalentes às que foram corrigidas nas
seções anteriores.

No servidor, a linha que define onde ele escuta:

```python
server = SimpleXMLRPCServer(("localhost", 8000))
```

No cliente, a linha que define para onde ele aponta:

```python
proxy = xmlrpc.client.ServerProxy("http://localhost:8000/")
```

São as mesmas duas decisões do primeiro degrau, com outra aparência. Aplicar as mesmas correções,
sem executar antes para observar a falha, porque ela já foi observada duas vezes.

Na máquina `banco`:

```python
server = SimpleXMLRPCServer(("0.0.0.0", 8000))
```

Na máquina `aplicacao`:

```python
proxy = xmlrpc.client.ServerProxy("http://192.168.56.101:8000/")
```

### 6.3 A execução

Na máquina `banco`:

```bash
python3 servidorRPC.py
```

```
Servidor RPC aguardando requisições...
```

Na máquina `aplicacao`:

```bash
python3 clienteRPC.py
```

```
Soma: 10 + 5 = 15
Subtração: 10 - 5 = 5
Multiplicação: 10 * 5 = 50
Divisão: 10 / 5 = 2.0
Divisão por zero: 10 / 0 = Erro: Divisão por zero
```

Na máquina `banco`, o servidor registra cada requisição recebida, com o endereço de origem.

### 6.4 O que não mudou no código do cliente

Examinar a linha que produz a primeira operação:

```python
print("Soma: 10 + 5 =", proxy.add(10, 5))
```

Não há soquete, não há codificação de texto, não há tamanho de buffer, não há endereço e não há
porta. A invocação tem a forma de uma chamada de função, com nome e argumentos, e o resultado é
utilizado como o retorno de uma função.

A soma, no entanto, não foi calculada na máquina `aplicacao`. Ela foi calculada na máquina `banco`,
e o resultado atravessou a rede.

**Registrar, para a comparação final:** quantas linhas do cliente TCP tratam da comunicação, e
quantas linhas do cliente RPC tratam da comunicação.

Essa é a transparência de localização, e também o seu limite. A chamada tem a forma de uma chamada
local, mas pode falhar por motivos que uma chamada local nunca tem, entre eles a máquina de destino
desligada, a rede indisponível e o serviço não iniciado. Para comprovar, interromper o servidor na
máquina `banco` e executar o cliente novamente.

### 6.5 O erro que voltou como valor

A última operação do cliente solicita uma divisão por zero. Observar o que foi apresentado.

O resultado não foi uma interrupção do programa. Foi o texto `Erro: Divisão por zero`, devolvido
pelo servidor como se fosse um resultado qualquer, porque a função do lado do serviço trata o caso
e retorna uma mensagem.

Isso levanta uma questão de contrato. Quem chama recebeu um texto onde esperava um número, e nada
no formato da resposta distingue um resultado de um erro. Como quem chama poderia diferenciar os
dois casos de maneira confiável.

A resposta a essa pergunta é o que dá origem aos códigos de resultado, presentes no degrau
seguinte.

---

## 7. Terceiro degrau, o que já estava no ar

Nenhum arquivo é criado nesta seção.

A aplicação da prática anterior continua em funcionamento na máquina `aplicacao`, e ela também
atende pedidos vindos da rede. A diferença é que ali o enquadramento das mensagens, o método, o
formato dos dados e o código de resultado já vieram prontos.

Na sessão da máquina **`banco`**, solicitar os dados da aplicação que executa na outra máquina:

```bash
curl http://192.168.56.102:3000/pessoas
```

Caso o comando não esteja disponível:

```bash
wget -q -O - http://192.168.56.102:3000/pessoas
```

A resposta é a lista de registros em formato JSON. Trata-se da terceira travessia de rede da
prática, agora entre duas máquinas virtuais, partindo daquela que hospeda o banco de dados.

Observar três elementos que não existiam nos degraus anteriores e que ninguém precisou escrever
nesta prática. O método, que declara a intenção do pedido. O formato dos dados, que é conhecido por
ambos os lados sem combinação prévia entre eles. E o código de resultado, que informa se o pedido
foi atendido, de maneira separada do conteúdo da resposta.

Para observar o terceiro elemento de forma explícita:

```bash
curl -i http://192.168.56.102:3000/pessoas
```

```bash
curl -i http://192.168.56.102:3000/naoexiste
```

O primeiro pedido resulta em 200 e o segundo em 404. Nos dois casos houve resposta, e o que os
distingue é o código, e não a ausência de conteúdo. Comparar isso com a situação da seção 6.5, em
que o erro voltou misturado ao resultado.

---

## 8. Síntese

A mesma operação foi realizada em três formas, entre as mesmas duas máquinas.

| | Degrau 1, soquete | Degrau 2, chamada remota | Degrau 3, HTTP e JSON |
|---|---|---|---|
| Quem define o formato da mensagem | o aluno | o mecanismo | o padrão |
| Quem separa uma mensagem da seguinte | o aluno | o mecanismo | o padrão |
| Como o erro é informado | não é | misturado ao resultado | em campo próprio |
| O que o código de quem chama menciona | endereço, porta e bytes | endereço e nome da função | endereço e recurso |
| O que o aluno precisou escrever | tudo | a chamada | nada |

Cada degrau acima resolveu alguma coisa que o anterior deixava para quem escreve o programa. E cada
um deles escondeu, em troca, uma decisão que alguém tomou em outro lugar.

As categorias de middleware apresentadas em aula deixam de ser uma lista a memorizar. A chamada
remota do segundo degrau é a categoria de chamada de procedimento remoto. A aplicação do terceiro
degrau comunica-se por um contrato publicado, no sentido discutido na aula sobre arquitetura
orientada a serviços.

O que nenhum dos três degraus resolveu foi a incerteza da seção 5.6. Em todos eles, quem chama
continua sem saber, diante da ausência de resposta, se o pedido não chegou ou se a resposta se
perdeu. As duas hipóteses exigem condutas opostas, e é disso que trata a prática seguinte.

---

## 9. Referência de comandos

**Abrir as sessões, na máquina hospedeira**

```bash
ssh SEU_USUARIO@192.168.56.101
ssh SEU_USUARIO@192.168.56.102
```

**Confirmar em qual máquina a sessão está**

```bash
hostname -I
```

**Executar cada programa**

```bash
python3 servidorTCP.py       # maquina banco
python3 clienteTCP.py        # maquina aplicacao
python3 servidorUDP.py       # maquina banco
python3 clienteUDP.py        # maquina aplicacao
python3 servidorRPC.py       # maquina banco
python3 clienteRPC.py        # maquina aplicacao
```

**Interromper um servidor em execução**

```
Ctrl+C
```

**Verificar em qual endereço um serviço está escutando, na máquina do serviço**

```bash
ss -ltnp | grep 12345        # servicos TCP
ss -lunp | grep 12345        # servicos UDP
```

A coluna de endereço local apresenta `127.0.0.1:12345` quando a vinculação é à interface de retorno
e `0.0.0.0:12345` quando é a todas as interfaces. É a forma de conferir a correção sem executar o
cliente.

**Verificar alcance entre as máquinas**

```bash
ping -c 3 192.168.56.101
```

---

## 10. Diagnóstico de falhas

| Sintoma | Causa provável | Verificação |
|---|---|---|
| `ConnectionRefusedError` com o servidor em execução | cliente apontado para `localhost`, ou servidor vinculado a `localhost` | conferir a linha de conexão no cliente e executar `ss -ltnp` na máquina do serviço |
| `OSError: [Errno 98] Address already in use` | porta retida em estado de encerramento, após o servidor ter atendido algum cliente | conferir com `ss -tan` na máquina do serviço, aguardar cerca de um minuto e iniciar de novo, conforme a seção 4.7 |
| Cliente UDP fica pendurado indefinidamente | serviço inexistente, endereço incorreto, ou vinculação à interface de retorno | acrescentar o tempo limite da seção 5.6 e conferir com `ss -lunp` |
| Cliente TCP fica pendurado em vez de recusar | filtro de pacotes descartando em silêncio | `sudo ufw status` na máquina do serviço |
| `ping` não alcança a outra máquina | máquina desligada, ou adaptador de rede inativo | `hostname -I` nas duas sessões, e a seção 3.5 do roteiro anterior |
| O comando `curl` não existe | não instalado na imagem | usar `wget -q -O -`, conforme a seção 7 |
| O servidor UDP encerra após uma execução | comportamento do programa, que atende um único datagrama | reiniciar antes de cada execução do cliente |
| Erro de indentação ao executar | espaços perdidos na colagem | conferir com `cat -A`, e a seção 4.6 do roteiro anterior |

---

## 11. Apêndice com o conteúdo integral dos arquivos

Os seis arquivos são apresentados **na forma original**, como foram executados no ambiente de
nuvem, com `localhost` nas duas pontas. As alterações são realizadas ao longo da prática, nos
pontos indicados, e não devem ser antecipadas. A observação do comportamento antes de cada
correção é parte do exercício.

### 11.1 `servidorTCP.py`, na máquina `banco`

```python
import socket
import threading

# Flag para controlar o loop principal do servidor
running = True

def manipula_cliente(connection, addr):
	print(f"conexão estabelecida com {addr}.")
	data = connection.recv(1024)
	print(f"Mensagem recebida: {data.decode()}")
	connection.sendall("Mensagem recebida".encode())
	connection.close()

server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server_socket.bind(('localhost', 12345))
server_socket.listen(5)

print("Servidor TCP aguardando conexões...")

try:
	while running:
		connection, addr = server_socket.accept()
		client_thread = threading.Thread(target=manipula_cliente, args=(connection, addr))
		client_thread.start()
except KeyboardInterrupt:
	print("\nServidor interrompido manualmente.")

# Finalizando o servidor
server_socket.close()
print("Servidor encerrado.")
```

### 11.2 `clienteTCP.py`, na máquina `aplicacao`

```python
import socket

# Configuração do cliente
client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
client_socket.connect(('localhost', 12345))

# Enviando dados para o servidor
client_socket.sendall("Olá, servidor!".encode())

# Recebendo resposta do servidor
data = client_socket.recv(1024)
print(f"Resposta do servidor: {data.decode()}")

client_socket.close()
```

### 11.3 `servidorUDP.py`, na máquina `banco`

```python
import socket

# Configuração do servidor
server_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
server_socket.bind(('localhost', 12345))

print("Servidor UDP aguardando mensagem...")

# Recebendo dados do cliente
data, addr = server_socket.recvfrom(1024)
print(f"Mensagem recebida: {data.decode()} de {addr}")

# Enviando resposta
server_socket.sendto("Mensagem recebida".encode(), addr)
server_socket.close()
```

### 11.4 `clienteUDP.py`, na máquina `aplicacao`

```python
import socket

# Configuração do cliente
client_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# Enviando dados para o servidor
client_socket.sendto("Olá, servidor!".encode(), ('localhost', 12345))

# Recebendo resposta do servidor
data, server = client_socket.recvfrom(1024)
print(f"Resposta do servidor: {data.decode()}")

client_socket.close()
```

### 11.5 `servidorRPC.py`, na máquina `banco`

```python
from xmlrpc.server import SimpleXMLRPCServer

# Função que realiza a soma de dois números.
def add(x, y):
    return x + y

# Função que realiza a subtração de dois números.
def subtract(x, y):
    return x - y

# Função que realiza a multiplicação de dois números.
def multiply(x, y):
    return x * y

# Função que realiza a divisão de dois números, com tratamento para divisão por zero.
def divide(x, y):
    if y == 0:
        return "Erro: Divisão por zero"
    return x / y

# Cria um servidor RPC que escuta no endereço 'localhost' e na porta 8000.
server = SimpleXMLRPCServer(("localhost", 8000))
print("Servidor RPC aguardando requisições...")

# Registra as funções que estarão disponíveis para chamadas remotas.
server.register_function(add, "add")
server.register_function(subtract, "subtract")
server.register_function(multiply, "multiply")
server.register_function(divide, "divide")

# Mantém o servidor em execução, aguardando novas requisições indefinidamente.
server.serve_forever()
```

### 11.6 `clienteRPC.py`, na máquina `aplicacao`

```python
import xmlrpc.client

# Cria um proxy que se conecta ao servidor RPC em execução no endereço "localhost" na porta 8000.
proxy = xmlrpc.client.ServerProxy("http://localhost:8000/")

# Realiza chamadas de procedimento remoto (RPC) para as funções registradas no servidor.
# Cada chamada aqui é feita como se a função estivesse sendo executada localmente, mas, na
# verdade, ela é executada no servidor.

# Chama a função 'add' remotamente, que soma os valores 10 e 5.
print("Soma: 10 + 5 =", proxy.add(10, 5))

# Chama a função 'subtract' remotamente, que subtrai 5 de 10.
print("Subtração: 10 - 5 =", proxy.subtract(10, 5))

# Chama a função 'multiply' remotamente, que multiplica 10 por 5.
print("Multiplicação: 10 * 5 =", proxy.multiply(10, 5))

# Chama a função 'divide' remotamente, que divide 10 por 5.
print("Divisão: 10 / 5 =", proxy.divide(10, 5))

# Tenta dividir 10 por 0, o que resultará em um erro tratado pelo servidor.
print("Divisão por zero: 10 / 0 =", proxy.divide(10, 0))
```
