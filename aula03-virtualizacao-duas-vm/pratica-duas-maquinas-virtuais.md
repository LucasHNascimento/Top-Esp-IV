# Prática: aplicação e banco de dados em duas máquinas virtuais

**Disciplina:** Tópicos Especiais IV (Computação Distribuída)
**Curso:** Bacharelado em Sistemas de Informação, UNIPAM

Este roteiro dá continuidade à prática de virtualização realizada nos encontros anteriores. Ali, a
aplicação e o banco de dados executavam em dois contêineres dentro de uma mesma máquina. Aqui,
cada um passa a executar em uma máquina virtual distinta, e a comunicação entre eles atravessa uma
rede.

---

## Objetivos de aprendizagem

Ao final desta prática o aluno deve ser capaz de:

- Distinguir os modos de rede do VirtualBox e justificar o emprego de dois adaptadores por máquina
- Configurar endereçamento em uma rede entre máquinas virtuais e verificar a conectividade
- Explicar por que a resolução de nome deixa de funcionar quando os serviços saem de um mesmo
  arquivo de composição, e apresentar duas formas de resolvê-la
- Distinguir o endereço em que um serviço escuta do endereço pelo qual ele é alcançado
- Identificar, no próprio banco de dados, a origem de uma conexão recebida pela rede
- Descrever o que ocorre com a aplicação quando o serviço do qual ela depende deixa de responder

---

## Relação com a prática anterior

A prática anterior colocou dois processos para conversar sem memória compartilhada, o que já
constitui um sistema distribuído em sentido estrito. Ela tinha, entretanto, um limite declarado.
Nada atravessava fronteira de máquina. Os dois contêineres compartilhavam o mesmo sistema
operacional, a mesma pilha de rede e o mesmo relógio, e a comunicação entre eles nunca saía do
hospedeiro.

Esta prática remove esse limite. As duas metades do sistema passam a executar em máquinas com
sistemas operacionais próprios, interfaces de rede próprias e endereços próprios. A mensagem que
antes percorria uma rede virtual interna ao Docker passa agora a percorrer uma rede entre máquinas.

A consequência mais importante é conceitual, e aparece na seção 1.3. Uma linha do código da
aplicação deixa de funcionar, e o motivo dessa falha é o assunto central desta prática.

---

## 1. Fundamentação

### 1.1 Por que duas máquinas

Na composição anterior, um único arquivo declarava os dois serviços. O Docker criava para eles uma
rede virtual, atribuía endereços, e mantinha um resolvedor de nomes interno que traduzia o nome de
cada serviço para o endereço correspondente. A aplicação conectava ao banco pelo nome `db`, e
funcionava.

Toda essa infraestrutura era invisível, e é justamente por ser invisível que ela impede a
compreensão do que acontece em um sistema real. Ao separar os dois serviços em máquinas distintas,
cada uma dessas facilidades precisa ser reconstruída de forma explícita. O aluno passa a lidar com
endereço, porta, rota e resolução de nome como problemas concretos, e não como detalhes que uma
ferramenta resolve por baixo.

### 1.2 Os modos de rede do VirtualBox

O VirtualBox oferece diversos modos de conexão para o adaptador de rede de uma máquina virtual.
Três interessam a esta prática.

**NAT.** Cada adaptador em NAT recebe uma rede privada isolada, com um roteador próprio criado
pelo VirtualBox. A máquina virtual alcança a internet, mas não é alcançável de fora, e duas
máquinas em NAT não se enxergam, porque cada uma possui seu próprio roteador. Um detalhe revela
esse isolamento de forma clara: todas as máquinas em NAT recebem o mesmo endereço, 10.0.2.15.

**Rede exclusiva de hospedeiro.** Cria uma interface adicional no sistema hospedeiro e uma rede
compartilhada entre ele e as máquinas virtuais que a utilizarem. As máquinas se enxergam entre si
e enxergam o hospedeiro, e o hospedeiro as enxerga. Não há saída para a internet.

**Placa em modo bridge.** A máquina virtual aparece na rede física como se fosse um computador
adicional, com endereço fornecido pela mesma rede do hospedeiro. Oferece o alcance mais amplo, e
depende de a rede local permitir que uma porta apresente mais de um endereço de hardware, o que
nem sempre ocorre em redes institucionais.

Nenhum modo isolado atende ao que esta prática exige, que é comunicação entre as duas máquinas
virtuais, acesso a partir do hospedeiro, e saída para a internet para obtenção de pacotes e
imagens. A solução adotada é atribuir **dois adaptadores a cada máquina**.

| Adaptador | Modo | Finalidade | Interface no Lubuntu |
|---|---|---|---|
| 1 | NAT | saída para a internet | `enp0s3` |
| 2 | Rede exclusiva de hospedeiro | comunicação entre as máquinas e com o hospedeiro | `enp0s8` |

A escolha é também didática. Uma máquina com duas interfaces, dois endereços e uma tabela de rotas
que decide por qual delas cada pacote sai é exatamente a situação de qualquer servidor real, e não
uma simplificação de laboratório.

### 1.3 Nome e endereço

Este é o conceito central da prática.

A aplicação conecta ao banco por meio da seguinte configuração, presente em `server.js`:

```javascript
const pool = new Pool({
  user: 'root',
  host: 'db',
  database: 'projeto',
  password: 'root',
  port: 5432,
});
```

O valor de `host` é `db`, que é um **nome**, e não um endereço. Enquanto os dois serviços
pertenciam ao mesmo arquivo de composição, esse nome era traduzido pelo resolvedor interno do
Docker para o endereço que o contêiner do banco possuía naquele instante.

Separadas as máquinas, esse resolvedor deixa de existir para o par. O nome `db` não corresponde a
nada que a máquina da aplicação saiba traduzir, e a conexão falha antes mesmo de qualquer pacote
ser enviado, porque não há para onde enviá-lo.

A distinção que essa falha torna concreta é a seguinte. Um **endereço** informa onde algo está
neste momento, e é volátil, pois muda quando a máquina é recriada, migrada ou reconfigurada. Um
**nome** é estável, e por isso é o que se escreve no código. Entre os dois é preciso existir um
**mecanismo de tradução**, e alguém precisa mantê-lo atualizado.

O Docker mantinha esse mecanismo automaticamente. A partir daqui, ele passa a ser responsabilidade
de quem opera o sistema. A seção 6 apresenta duas formas de resolvê-lo, e a comparação entre elas é
o que prepara o estudo de descoberta de serviço em ambientes orquestrados.

### 1.4 Onde um serviço escuta

Um processo que aceita conexões precisa associar-se a um endereço e a uma porta. A escolha do
endereço determina de onde ele pode ser alcançado.

Associar-se a `127.0.0.1` significa aceitar conexões apenas de processos da própria máquina.
Associar-se a `0.0.0.0` significa aceitar conexões por qualquer interface de rede que a máquina
possua.

Um serviço que escuta apenas em `127.0.0.1` é inalcançável pela rede, ainda que a rede esteja
perfeitamente configurada e o roteamento correto. Esta é uma das causas mais frequentes de falha
aparente de conectividade, e o diagnóstico correto exige distinguir o problema de rede do problema
de associação.

Nesta prática, a publicação de porta declarada no arquivo de composição resolve a questão para os
dois serviços, e a seção 3.3 verifica esse comportamento de forma explícita.

---

## 2. Preparação das duas máquinas virtuais

A partir daqui, as duas máquinas serão referidas por seus papéis. A máquina **banco** hospeda o
PostgreSQL. A máquina **aplicacao** hospeda o servidor web.

| Máquina | Função | Endereço na rede interna |
|---|---|---|
| `banco` | PostgreSQL em contêiner | 192.168.56.101 |
| `aplicacao` | servidor Node.js em contêiner | 192.168.56.102 |
| máquina hospedeira | acesso à aplicação pelo navegador | 192.168.56.1 |

### 2.1 Obter a segunda máquina virtual

Caso exista apenas uma máquina virtual, a segunda pode ser obtida por clonagem, o que dispensa
nova instalação do sistema operacional.

Com a máquina desligada, acionar o menu de contexto sobre ela e escolher **Clonar**. Definir o nome
`aplicacao`. Manter selecionada a opção de **gerar novos endereços MAC para todas as placas de
rede**, que é o padrão. Escolher **clone ligado** quando a opção estiver disponível, por consumir
substancialmente menos espaço em disco.

Concluída a clonagem, iniciar a máquina clonada e definir um nome distinto para ela:

```bash
sudo hostnamectl set-hostname aplicacao
```

Repetir o procedimento na outra máquina, com o nome `banco`. Reiniciar as duas.

> **Por que o nome importa.** Duas máquinas com o mesmo nome em uma mesma rede produzem
> diagnósticos confusos, e determinadas configurações de rede derivam do nome o identificador
> apresentado ao serviço de atribuição de endereços. Em uma máquina clonada, esse identificador é
> idêntico ao da original.

### 2.2 Configurar os adaptadores de rede

Executar em **cada uma das duas máquinas**, com a máquina **desligada**.

Abrir **Configurações**, seção **Rede**.

Na aba **Adaptador 1**, confirmar que a opção **Habilitar Placa de Rede** está marcada e que o
campo **Conectado a** contém **NAT**.

Na aba **Adaptador 2**, marcar **Habilitar Placa de Rede** e selecionar, no campo **Conectado a**,
a opção **Placa de rede exclusiva de hospedeiro**. No campo **Nome**, selecionar a interface
disponível, usualmente denominada `VirtualBox Host-Only Ethernet Adapter`.

Confirmar e iniciar as duas máquinas.

> **Observação.** Caso a lista do campo **Nome** esteja vazia, a interface exclusiva de hospedeiro
> ainda não existe no sistema hospedeiro. Sua criação exige privilégio administrativo e deve ser
> solicitada ao responsável pelo laboratório.

### 2.3 Identificar as interfaces

Executar em cada máquina:

```bash
ip -br addr
```

O comando apresenta as interfaces de forma resumida. A saída esperada contém três linhas:

```
lo               UNKNOWN        127.0.0.1/8 ::1/128
enp0s3           UP             10.0.2.15/24 ...
enp0s8           UP             192.168.56.103/24 ...
```

A interface `lo` é a de retorno, restrita à própria máquina. A interface `enp0s3` corresponde ao
adaptador em NAT, e apresenta o endereço 10.0.2.15 em ambas as máquinas, o que confirma o
isolamento descrito em 1.2. A interface `enp0s8` corresponde ao adaptador exclusivo de hospedeiro,
e é por ela que as duas máquinas se comunicarão.

O endereço apresentado em `enp0s8` foi atribuído automaticamente e pode variar entre execuções. A
seção seguinte o fixa.

> **Se `enp0s8` não aparecer**, a máquina foi iniciada antes da configuração do segundo adaptador.
> Desligar, conferir a aba **Adaptador 2** e iniciar novamente.

### 2.4 Fixar o endereço na rede interna

Um endereço atribuído automaticamente pode mudar a cada inicialização. Como a configuração da
aplicação fará referência ao endereço do banco, essa variação interromperia o sistema sem que
nenhuma linha de código houvesse sido alterada.

Fixar o endereço é, portanto, uma medida operacional necessária. Convém notar, desde já, que ela
não resolve o problema, apenas o adia. A volatilidade do endereço é uma característica de qualquer
infraestrutura real, e é exatamente o que motiva a existência dos nomes discutidos em 1.3.

Identificar o nome da conexão associada ao segundo adaptador:

```bash
nmcli -f NAME,DEVICE connection show
```

A saída relaciona cada conexão ao dispositivo correspondente. Localizar a linha cujo dispositivo é
`enp0s8` e anotar o nome, usualmente `Wired connection 2`.

Na máquina **banco**, aplicar:

```bash
sudo nmcli connection modify "Wired connection 2" \
  ipv4.method manual \
  ipv4.addresses 192.168.56.101/24
sudo nmcli connection up "Wired connection 2"
```

Na máquina **aplicacao**, aplicar o mesmo comando com o endereço 192.168.56.102.

> **Não definir rota padrão nesta interface.** A saída para a internet pertence ao adaptador em
> NAT. A atribuição de uma rota padrão à interface exclusiva de hospedeiro, que não possui saída,
> interrompe o acesso à internet e impede a obtenção de pacotes e imagens.

Verificar o resultado:

```bash
ip -br addr show enp0s8
```

### 2.5 Verificar a comunicação entre as máquinas

A verificação precede qualquer instalação. Um problema de rede diagnosticado agora custa pouco, e
diagnosticado depois de o sistema estar montado custa muito, porque se confunde com defeito de
aplicação.

A partir da máquina **aplicacao**:

```bash
ping -c 3 192.168.56.101
```

A partir da máquina **banco**:

```bash
ping -c 3 192.168.56.102
```

A partir de qualquer uma delas, verificar o alcance da máquina hospedeira:

```bash
ping -c 3 192.168.56.1
```

E verificar a saída para a internet, que deve continuar funcionando pelo adaptador em NAT:

```bash
ping -c 3 8.8.8.8
```

Os quatro comandos devem responder. Em caso de falha, consultar a seção 9.

---

## 3. A máquina do banco de dados

Todos os comandos desta seção são executados na máquina **banco**.

### 3.1 Preparar o diretório e o arquivo de composição

```bash
mkdir -p ~/banco
cd ~/banco
nano docker-compose.yml
```

Conteúdo do arquivo:

```yaml
services:
  db:
    image: postgres:17
    container_name: postgres_container
    restart: always
    environment:
      POSTGRES_USER: root
      POSTGRES_PASSWORD: root
      POSTGRES_DB: projeto
    ports:
      - "5432:5432"
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U root -d projeto"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  db_data:
```

O arquivo é o mesmo da prática anterior, do qual foi removido o serviço da aplicação. Duas linhas
merecem atenção.

A declaração `ports: "5432:5432"` publica a porta do contêiner em todas as interfaces de rede da
máquina virtual, e não apenas na interface de retorno. É ela que torna o banco alcançável a partir
da outra máquina. Na prática anterior essa linha existia para permitir o acesso por um cliente
gráfico. Aqui ela deixa de ser conveniência e passa a ser requisito.

A declaração `volumes` associa o diretório de dados do PostgreSQL a um volume nomeado, cujo ciclo
de vida é independente do contêiner. O estado sobrevive à remoção e à recriação do contêiner, e a
seção 7.3 utiliza essa propriedade.

### 3.2 Iniciar o banco

```bash
docker compose up -d
```

O parâmetro `-d` executa em segundo plano. A primeira execução obtém a imagem do PostgreSQL, o que
depende da rede e demora mais que as seguintes.

Verificar:

```bash
docker compose ps
```

A coluna de estado deve indicar que o serviço está em execução e íntegro. A indicação de
integridade provém do `healthcheck` declarado, que consulta periodicamente a disponibilidade do
banco.

> **Se a prática anterior foi executada nesta mesma máquina** com uma versão anterior do
> PostgreSQL, o volume existente foi gravado por aquela versão e não será aberto pela versão 17. A
> solução é remover o volume antes de subir, com `docker compose down -v`. O comando descarta os
> dados anteriores.

### 3.3 Verificar que o banco escuta na rede

Esta verificação materializa o conceito apresentado em 1.4.

```bash
sudo ss -tlnp | grep 5432
```

O comando relaciona as portas em que há processos aguardando conexão. A saída esperada apresenta o
endereço `0.0.0.0:5432`, e não `127.0.0.1:5432`. O primeiro indica que o serviço aceita conexões
por qualquer interface. O segundo indicaria que apenas processos locais poderiam alcançá-lo, e a
aplicação, na outra máquina, jamais conectaria.

A verificação a partir da outra máquina é o teste definitivo. Executar, na máquina **aplicacao**:

```bash
nc -zv 192.168.56.101 5432
```

A resposta deve indicar sucesso na conexão. O comando não envia dado algum, apenas estabelece e
encerra uma conexão, o que confirma que há um processo escutando e que a rede o alcança.

### 3.4 Criar a tabela

A aplicação pressupõe a existência de uma tabela, que precisa ser criada antes do primeiro uso.

```bash
docker exec -it postgres_container psql -U root -d projeto
```

O comando `docker exec` executa um processo dentro de um contêiner em funcionamento. O parâmetro
`-it` associa o terminal, de modo que o cliente interativo do PostgreSQL possa ser utilizado.

No interior do cliente, criar a tabela:

```sql
CREATE TABLE pessoas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    telefone VARCHAR(20)
);
```

Confirmar a criação e encerrar:

```sql
\dt
\q
```

A restrição `UNIQUE` sobre a coluna de correio eletrônico é utilizada na seção 7.

---

## 4. A máquina da aplicação

Todos os comandos desta seção são executados na máquina **aplicacao**.

### 4.1 Obter os arquivos do projeto

Os arquivos da aplicação são os mesmos da prática anterior. Caso já estejam nesta máquina, o
diretório existente pode ser reaproveitado. Caso contrário, transferi-los a partir da máquina
hospedeira, ou recriá-los conforme o roteiro anterior.

```bash
cd ~/aula-01-virtualizacao
ls
```

O diretório deve conter `server.js`, `package.json`, `dockerfile`, `.dockerignore` e a pasta
`public`.

### 4.2 A alteração necessária no código

Abrir o arquivo do servidor:

```bash
nano server.js
```

Localizar a configuração da conexão, próxima ao início do arquivo:

```javascript
const pool = new Pool({
  user: 'root',
  host: 'db',
  database: 'projeto',
  password: 'root',
  port: 5432,
});
```

Substituir a linha do campo `host` pela seguinte:

```javascript
  host: process.env.DB_HOST || 'db',
```

De modo que a configuração fique assim:

```javascript
const pool = new Pool({
  user: 'root',
  host: process.env.DB_HOST || 'db',
  database: 'projeto',
  password: 'root',
  port: 5432,
});
```

A alteração substitui um valor fixo por uma variável de ambiente, mantendo o valor anterior como
alternativa quando a variável não for definida.

O motivo não é de conveniência. A configuração de conexão depende de onde o sistema está
implantado, e o código não depende. Uma mesma imagem passa a executar tanto na composição anterior,
em que o nome `db` é resolvido pelo Docker, quanto nesta, em que o endereço é informado de fora.
Separar o que varia do que não varia é o que permite que um mesmo artefato seja implantado em
ambientes distintos, e é o princípio que sustenta as práticas de implantação estudadas adiante no
programa.

### 4.3 Arquivo de composição

```bash
nano docker-compose.yml
```

Substituir integralmente o conteúdo por:

```yaml
services:
  app:
    build: .
    container_name: app_container
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DB_HOST=192.168.56.101
```

Três diferenças em relação ao arquivo da prática anterior merecem registro.

O serviço `db` não existe mais neste arquivo, porque o banco não executa nesta máquina.

A cláusula `depends_on` foi removida. Ela expressa dependência entre serviços de uma mesma
composição, e não tem como expressar dependência de um serviço que está em outra máquina. A
aplicação passa a subir sem qualquer garantia de que o banco esteja disponível, situação que a
seção 7.3 examina.

A variável `DB_HOST` informa o endereço do banco. É neste ponto, e apenas neste, que o endereço da
outra máquina aparece.

### 4.4 Construir e iniciar

```bash
docker compose up -d --build
```

O parâmetro `--build` reconstrói a imagem antes de iniciar. É necessário porque o `dockerfile`
copia o código para dentro da imagem no instante da construção, de modo que a alteração feita em
`server.js` não estaria presente em uma imagem construída anteriormente.

Verificar:

```bash
docker compose ps
docker compose logs app
```

O registro deve apresentar a mensagem de que o servidor está em execução. A ausência de mensagens
de erro de conexão indica que a aplicação alcançou o banco na outra máquina.

---

## 5. Acesso a partir da máquina hospedeira

A aplicação executa na máquina virtual `aplicacao`, e o navegador executa na máquina hospedeira.
São máquinas distintas, e o endereço utilizado precisa refletir isso.

Abrir, no navegador da máquina hospedeira:

```
http://192.168.56.102:3000
```

O endereço `localhost:3000` **não funciona**, e a razão é conceitual. O nome `localhost` designa a
própria máquina em que o navegador executa, que é a hospedeira, e nela não há servidor algum na
porta 3000. O servidor está na máquina virtual, e é preciso nomeá-la pelo endereço que ela possui
na rede compartilhada.

A prática anterior utilizava `localhost` porque empregava redirecionamento de portas em NAT, que
faz o hospedeiro escutar em seu próprio nome e encaminhar o tráfego. Aqui, a rede exclusiva de
hospedeiro torna a máquina virtual diretamente alcançável, e o redirecionamento é dispensável.

Neste ponto, o sistema está completo, e vale observar seu formato. Um navegador na máquina
hospedeira solicita uma página a um servidor na máquina `aplicacao`, que por sua vez consulta um
banco na máquina `banco`. São três máquinas e duas travessias de rede.

---

## 6. Nome e endereço: duas formas de resolver

A configuração da seção 4 utiliza o endereço explícito. Ela funciona, e é a forma mais direta.
Possui, entretanto, uma propriedade indesejável que convém tornar visível.

### 6.1 A fragilidade do endereço explícito

Na máquina **aplicacao**, examinar de onde vem o endereço:

```bash
grep DB_HOST docker-compose.yml
```

O endereço 192.168.56.101 está registrado no arquivo de composição. Se a máquina `banco` for
recriada, migrada para outra rede, ou reconfigurada com endereço distinto, este arquivo passa a
apontar para lugar nenhum, e o sistema deixa de funcionar sem que qualquer linha de código tenha
sido alterada.

Em um sistema com dois serviços, o problema é administrável. Com dezenas de serviços implantados
em máquinas que são criadas e destruídas continuamente, o registro manual de endereços deixa de ser
viável.

### 6.2 O nome, por registro local

A alternativa consiste em restabelecer a tradução de nome para endereço que o Docker realizava.
Sua forma mais simples é o arquivo de mapeamento local do sistema.

Na máquina **aplicacao**:

```bash
sudo nano /etc/hosts
```

Acrescentar, ao final do arquivo, a linha:

```
192.168.56.101   db
```

Verificar a tradução:

```bash
getent hosts db
```

O comando deve responder com o endereço associado. Antes da alteração, ele não retornaria nada,
porque o nome `db` não existia para esta máquina.

Com o nome disponível, a variável de ambiente pode passar a referenciá-lo em lugar do endereço:

```yaml
      - DB_HOST=db
```

Aplicar e reiniciar:

```bash
docker compose up -d
```

A aplicação volta a conectar, agora pelo nome. Note que, com essa configuração, o valor alternativo
codificado em `server.js` também funcionaria, uma vez que o nome procurado é o mesmo.

### 6.3 Análise

As duas formas produzem o mesmo resultado, e diferem no que exigem quando algo muda.

| | Endereço explícito | Nome com registro local |
|---|---|---|
| Onde o endereço aparece | no arquivo de composição da aplicação | no arquivo de mapeamento do sistema |
| O que muda se o banco mudar de endereço | o arquivo de composição, seguido de reinício do serviço | apenas o mapeamento |
| O que o código referencia | um endereço | um nome estável |
| Quem mantém a tradução | ninguém, não há tradução | o operador, manualmente |

Nenhuma das duas resolve o problema de fundo, que é a manutenção do mapeamento. Ambas exigem
intervenção humana quando um endereço muda, e ambas se degradam à medida que o número de serviços
cresce.

O que um ambiente orquestrado acrescenta é precisamente a automação dessa manutenção. Cada serviço
recebe um nome estável, e o registro que traduz esse nome é atualizado automaticamente sempre que
uma instância é criada, destruída ou reposicionada. O que o Docker realizava na prática anterior,
dentro de um único hospedeiro, é a mesma função exercida em escala por um orquestrador entre
diversas máquinas.

Este é o mecanismo de descoberta de serviço, retomado na Unidade 7 do programa. A diferença é que,
ao chegar lá, o aluno já terá mantido o mapeamento à mão e conhecerá o problema que a automação
resolve.

---

## 7. Operação e observação

### 7.1 Inserção e listagem

No navegador da máquina hospedeira, acessar `http://192.168.56.102:3000` e preencher o formulário
de cadastro com nome, correio eletrônico e telefone. Confirmar o envio.

A aplicação redireciona para a página de listagem, que consulta o serviço `/pessoas` e apresenta os
registros existentes.

Vale acompanhar o caminho percorrido pelos dados. O navegador, na máquina hospedeira, envia uma
requisição à aplicação, na máquina `aplicacao`. A aplicação executa uma instrução de inserção
contra o banco, na máquina `banco`. O dado é gravado em um volume que pertence àquela máquina. A
resposta retorna pelo mesmo caminho, em sentido inverso.

Nenhuma das três máquinas conhece o estado interno das demais. Toda informação que uma possui sobre
as outras chegou por mensagem.

### 7.2 A origem da conexão, vista pelo banco

Esta observação é o que distingue esta prática da anterior de forma mais direta.

Na máquina **banco**:

```bash
docker exec -it postgres_container psql -U root -d projeto
```

Consultar as conexões ativas:

```sql
SELECT client_addr, client_port, state, query
FROM pg_stat_activity
WHERE datname = 'projeto';
```

A coluna `client_addr` apresenta o endereço de origem de cada conexão. O valor observado é o
endereço da máquina `aplicacao` na rede interna, ou o endereço da rede que o Docker atribuiu ao
contêiner que a origina.

Na prática anterior, essa mesma consulta apresentaria um endereço da rede interna do Docker, no
mesmo hospedeiro. Aqui, o endereço pertence a outra máquina, e é a evidência, registrada pelo
próprio banco, de que a mensagem atravessou uma fronteira que antes não existia.

Encerrar com `\q`.

### 7.3 A dependência exposta

Este experimento demonstra a falha parcial, que é o fenômeno definidor dos sistemas distribuídos.

Na máquina **banco**, interromper o serviço:

```bash
docker compose stop
```

Na máquina hospedeira, recarregar a página de listagem da aplicação.

A aplicação **continua no ar**. O servidor responde, a página é entregue, e a requisição ao serviço
`/pessoas` falha com erro interno. A metade do sistema que executa na máquina `aplicacao` está
íntegra, e a metade que executa na máquina `banco` não está.

Este comportamento não tem equivalente em um programa único. Um programa que perde acesso ao seu
próprio armazenamento encerra. Um sistema distribuído permanece parcialmente disponível, e é
justamente essa disponibilidade parcial que exige decisões de projeto: o que a aplicação deve fazer
quando a dependência não responde, quanto tempo deve aguardar, quantas vezes deve tentar, e o que
deve informar ao usuário.

Examinar o registro da aplicação:

```bash
docker compose logs app
```

Na máquina **banco**, restabelecer o serviço:

```bash
docker compose start
```

Recarregar a página. A aplicação volta a funcionar sem que tenha sido reiniciada, porque o
mecanismo de conexão do cliente estabelece nova conexão quando a anterior falha.

Convém observar um ponto relacionado. Como a cláusula `depends_on` foi removida, nada garante que o
banco esteja disponível quando a aplicação inicia. Neste sistema isso não impede o funcionamento,
porque a conexão é estabelecida no momento de cada consulta, e não na inicialização. Em sistemas
que conectam na inicialização, a ausência dessa garantia produz falha de partida, e é o motivo pelo
qual existem estratégias de espera e de nova tentativa.

### 7.4 Persistência do estado

Na máquina **banco**, remover o contêiner e recriá-lo:

```bash
docker compose down
docker compose up -d
```

O comando `docker compose down` interrompe e **remove** o contêiner, sem remover o volume. A
recriação parte de um contêiner novo, associado ao mesmo volume.

Recarregar a listagem na aplicação. Os registros permanecem.

A conclusão é que processo e estado possuem ciclos de vida distintos. O contêiner é descartável, e
o volume não é. Essa separação é o que torna possível substituir a versão de um serviço sem perder
os dados que ele administra.

---

## 8. Referência de comandos

**Na máquina hospedeira, para inspeção das máquinas virtuais**

| Comando | Efeito |
|---|---|
| `ping 192.168.56.101` | verifica o alcance da máquina do banco |
| `ping 192.168.56.102` | verifica o alcance da máquina da aplicação |

**Em qualquer das máquinas virtuais**

| Comando | Efeito |
|---|---|
| `ip -br addr` | apresenta as interfaces e seus endereços |
| `ip route` | apresenta a tabela de rotas |
| `sudo ss -tlnp` | relaciona as portas em que há processos escutando |
| `nc -zv ENDERECO PORTA` | verifica se uma porta é alcançável |
| `getent hosts NOME` | consulta a tradução de um nome para endereço |
| `docker compose up -d` | inicia os serviços em segundo plano |
| `docker compose up -d --build` | reconstrói a imagem antes de iniciar |
| `docker compose ps` | apresenta o estado dos serviços |
| `docker compose logs SERVICO` | apresenta o registro de um serviço |
| `docker compose stop` | interrompe sem remover |
| `docker compose start` | retoma o que foi interrompido |
| `docker compose down` | interrompe e remove os contêineres |
| `docker compose down -v` | interrompe, remove e descarta os volumes |

---

## 9. Diagnóstico de falhas

| Sintoma | Causa provável | Verificação |
|---|---|---|
| `enp0s8` não aparece em `ip -br addr` | segundo adaptador não configurado, ou máquina iniciada antes da configuração | desligar e conferir a aba Adaptador 2 |
| As duas máquinas não se alcançam | adaptadores em redes distintas, ou endereços em faixas distintas | comparar `ip -br addr` nas duas |
| Perda de acesso à internet após fixar o endereço | rota padrão atribuída à interface exclusiva de hospedeiro | `ip route`, verificar se a rota padrão aponta para `enp0s3` |
| A aplicação registra erro de resolução de nome | `DB_HOST` não definido, e o nome `db` não é conhecido nesta máquina | `getent hosts db` e `grep DB_HOST docker-compose.yml` |
| A aplicação registra recusa de conexão | banco não iniciado, ou porta não publicada | na máquina do banco, `docker compose ps` e `sudo ss -tlnp` |
| A aplicação registra tempo de espera esgotado | as máquinas não se alcançam pela rede | `nc -zv 192.168.56.101 5432` a partir da aplicação |
| O navegador da hospedeira não abre a aplicação | endereço incorreto, ou aplicação não iniciada | usar o endereço da máquina, e não `localhost` |
| Erro ao inserir registro | tabela inexistente | na máquina do banco, `\dt` no cliente do PostgreSQL |
| Alteração no código sem efeito | imagem não reconstruída | `docker compose up -d --build` |
| O banco não inicia após atualização de versão | volume gravado por versão anterior | `docker compose down -v` |

Regra geral de diagnóstico: verificar em ordem crescente de camada. Primeiro se as máquinas se
alcançam, depois se a porta está publicada e sendo escutada, depois se o nome é traduzido, e apenas
então se a aplicação está correta. A ordem inversa consome tempo e conduz a conclusões erradas.

---

## 10. Síntese

A prática colocou em execução um sistema com três participantes em três máquinas distintas, e
tornou explícito o que a composição anterior mantinha oculto.

O sistema deixou de depender de um resolvedor de nomes fornecido pela ferramenta e passou a
depender de configuração feita por quem o opera. A distinção entre nome e endereço deixou de ser
enunciado e passou a ser uma decisão com consequências verificáveis, examinada na seção 6.

A publicação de porta deixou de ser conveniência e passou a ser requisito, pois é o que torna um
serviço alcançável a partir de outra máquina. O endereço em que um processo escuta mostrou-se
distinto do endereço pelo qual ele é alcançado.

O próprio banco registrou a origem da conexão recebida, o que constitui evidência, produzida pelo
sistema e não pelo roteiro, de que a comunicação atravessou fronteira de máquina.

A interrupção do banco demonstrou a falha parcial. Metade do sistema permaneceu íntegra enquanto a
outra metade não respondia, situação sem equivalente em um programa único, e que impõe decisões de
projeto quanto a espera, nova tentativa e informação ao usuário.

### Limites deste experimento

As três máquinas executam sobre o mesmo equipamento físico, e a rede que as conecta é virtual. A
comunicação entre elas é rápida e confiável, e nenhuma mensagem se perdeu ou chegou fora de ordem
durante a prática.

Os relógios das máquinas virtuais são, por padrão, mantidos sincronizados pelo sistema hospedeiro,
de modo que a divergência entre eles não se manifesta.

Essas três ausências, que são a latência, a perda e a divergência de relógios, não constituem
defeito do experimento. São as condições que as unidades seguintes do programa introduzem de forma
deliberada e controlada, e as questões que elas levantam são as seguintes. O que muda quando a
mensagem demora? O que muda quando ela não chega? E como ordenar eventos ocorridos em máquinas cujos
relógios discordam?

### Referência bibliográfica

COULOURIS, George et al. *Sistemas distribuídos: conceitos e projetos*. 5. ed. Porto Alegre:
Bookman, 2013. Capítulo 4, sobre comunicação entre processos, e capítulo 13, sobre serviços de
nomes.

VAN STEEN, Maarten; TANENBAUM, Andrew S. *Distributed Systems*. 4. ed. 2023. Capítulo 4, sobre
comunicação, e capítulo 5, sobre nomeação. Disponível em distributed-systems.net.
